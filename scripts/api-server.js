const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
require('dotenv').config();

const app = express();
const port = process.env.API_PORT || 3000;

app.use(express.json());

const queue = [];
let isProcessing = false;
let currentRunning = null;

// 📅 Hjälpfunktion för timestamps
function timestamp() {
  return `[${new Date().toISOString()}]`;
}

// 🛠 Skriver logg med tidsstämpel
function logWithTimestamp(data, isError = false) {
  const lines = data.toString().split('\n').filter(line => line.trim() !== '');
  for (const line of lines) {
    if (isError) {
      console.error(`${timestamp()} ${line}`);
    } else {
      console.log(`${timestamp()} ${line}`);
    }
  }
}

// 🚀 Kör hela arbetsflödet för ett test
async function runTestWorkflow(TestName, Recording, TestRunId) {
  try {
    const recordingsDir = path.join(__dirname, '../recordings');
    if (!fs.existsSync(recordingsDir)) {
      fs.mkdirSync(recordingsDir, { recursive: true });
    }

    const safeTestName = TestName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const recordingPath = path.join(recordingsDir, `${safeTestName}.json`);

    fs.writeFileSync(recordingPath, JSON.stringify(Recording, null, 2), 'utf-8');
    console.log(`${timestamp()} ✅ Sparade ny recording: ${safeTestName}.json`);

    // Konvertera till Cypress-test
    exec('node scripts/convert-all-recordings.js', { stdio: 'pipe' }, (err, stdout, stderr) => {
      if (stdout) logWithTimestamp(stdout);
      if (stderr) logWithTimestamp(stderr, true);

      if (err) {
        console.error(`${timestamp()} ❌ Fel vid konvertering: ${err.message}`);
        return;
      }

      console.log(`${timestamp()} 🚀 Konvertering klar. Startar Cypress...`);

      process.env.TEST_RUN_ID = TestRunId;

      const cypressProcess = spawn('npx', ['cypress', 'run', '--browser', 'edge', '--headless', '--spec', `cypress/e2e/${safeTestName}.cy.js`]);

      cypressProcess.stdout.on('data', (data) => logWithTimestamp(data));
      cypressProcess.stderr.on('data', (data) => logWithTimestamp(data, true));

      cypressProcess.on('close', (code) => {
        if (code !== 0) {
          console.error(`${timestamp()} ❌ Cypress test misslyckades med exit code ${code}`);
          return;
        }

        console.log(`${timestamp()} ✅ Cypress klart. Startar merge och post...`);

        exec('npm run merge && npm run post', { stdio: 'pipe' }, (err, stdout, stderr) => {
          if (stdout) logWithTimestamp(stdout);
          if (stderr) logWithTimestamp(stderr, true);

          if (err) {
            console.error(`${timestamp()} ❌ Fel vid merge/post: ${err.message}`);
          } else {
            console.log(`${timestamp()} ✅ Testresultat skickat till Helix!`);
          }
        });
      });
    });

  } catch (err) {
    console.error(`${timestamp()} ❌ Något gick fel i testflödet: ${err.message}`);
  }
}

// 📥 Hanterar nytt inkommande API-anrop
app.post('/api/run-test', async (req, res) => {
  const { TestName, Recording, TestRunId } = req.body;

  if (!TestName || !Recording || !TestRunId) {
    return res.status(400).json({ error: 'Missing TestName, Recording or TestRunId' });
  }

  queue.push({ TestName, Recording, TestRunId });
  console.log(`${timestamp()} 📥 Lagt till i kö: ${TestName}`);

  res.status(200).json({ message: `Mottagit ${TestName}. Köar för körning.` });

  if (!isProcessing) {
    processQueue();
  }
});

// 🔄 Köhanterare
async function processQueue() {
    if (queue.length === 0 && !currentRunning) {
      isProcessing = false;
      console.log(`${timestamp()} 💤 Kön är tom. Inget mer att köra.`);
      return;
    }
  
    if (!currentRunning) {
      const { TestName, Recording, TestRunId } = queue.shift();
      currentRunning = { TestName, TestRunId };
      isProcessing = true;
  
      console.log(`${timestamp()} 🚀 Startar körning av: ${TestName}`);
  
      try {
        const recordingsDir = path.join(__dirname, '../recordings');
        if (!fs.existsSync(recordingsDir)) {
          fs.mkdirSync(recordingsDir, { recursive: true });
        }
  
        const safeTestName = TestName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const recordingPath = path.join(recordingsDir, `${safeTestName}.json`);
  
        fs.writeFileSync(recordingPath, JSON.stringify(Recording, null, 2), 'utf-8');
        console.log(`${timestamp()} ✅ Sparade ny recording: ${safeTestName}.json`);
  
        console.log(`${timestamp()} 🚀 Konverterar till Cypress...`);
        await new Promise((resolve, reject) => {
          exec('node scripts/convert-all-recordings.js', { stdio: 'pipe' }, (err, stdout, stderr) => {
            if (stdout) logWithTimestamp(stdout);
            if (stderr) logWithTimestamp(stderr, true);
            if (err) {
              console.error(`${timestamp()} ❌ Fel vid konvertering: ${err.message}`);
              reject(err);
            } else {
              resolve();
            }
          });
        });
  
        console.log(`${timestamp()} 🚀 Startar Cypress...`);
  
        process.env.TEST_RUN_ID = TestRunId;
  
        await new Promise((resolve) => { // <-- INGEN reject här längre
          const cypressProcess = spawn('npx', ['cypress', 'run', '--browser', 'edge', '--headless', '--spec', `cypress/e2e/${safeTestName}.cy.js`]);
  
          cypressProcess.stdout.on('data', (data) => logWithTimestamp(data));
          cypressProcess.stderr.on('data', (data) => logWithTimestamp(data, true));
  
          cypressProcess.on('close', (code) => {
            if (code !== 0) {
              console.error(`${timestamp()} ⚠️ Cypress misslyckades med kod ${code} men fortsätter ändå`);
            } else {
              console.log(`${timestamp()} ✅ Cypress klart`);
            }
            resolve(); // <-- Vi kör vidare oavsett resultat
          });
        });
  
        console.log(`${timestamp()} 🚀 Kör merge och post...`);
        await new Promise((resolve, reject) => {
          exec('npm run merge && npm run post', { stdio: 'pipe' }, (err, stdout, stderr) => {
            if (stdout) logWithTimestamp(stdout);
            if (stderr) logWithTimestamp(stderr, true);
            if (err) {
              console.error(`${timestamp()} ❌ Fel vid merge/post: ${err.message}`);
              reject(err);
            } else {
              console.log(`${timestamp()} ✅ Merge och post klart`);
              resolve();
            }
          });
        });
  
      } catch (err) {
        console.error(`${timestamp()} ❌ Något gick fel under processen: ${err.message}`);
      } finally {
        currentRunning = null;
        isProcessing = false;
        processQueue(); // ➡️ Kör nästa från kön
      }
    }
  }  

// ❤️ Hälsocheck
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// 🔍 Endpoint för att visa aktuell köstatus
app.get('/api/queue-status', (req, res) => {
    res.status(200).json({
      queueLength: queue.length,
      queueItems: queue.map(item => ({
        TestName: item.TestName,
        TestRunId: item.TestRunId
      })),
      currentRunning,
      isProcessing
    });
  });
  

// 🚀 Starta API-servern
app.listen(port, () => {
  console.log(`${timestamp()} 🚀 API-server startad på port ${port}`);
});
