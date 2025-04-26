const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

// 📦 Hämta miljövariabler
const {
  HELIX_URL,
  HELIX_USER,
  HELIX_PASS,
  HELIX_FORM
} = process.env;

// 🔍 Kontrollera att allt viktigt finns
if (!HELIX_URL || !HELIX_USER || !HELIX_PASS || !HELIX_FORM) {
  console.error('❌ Saknade miljövariabler: HELIX_URL, HELIX_USER, HELIX_PASS, HELIX_FORM');
  process.exit(1);
}

async function loginHelix() {
  try {
    const response = await axios.post(`${HELIX_URL}/api/jwt/login`, null, {
      params: {
        username: HELIX_USER,
        password: HELIX_PASS
      }
    });
    console.log('✅ Lyckades logga in till Helix.');
    return response.data; // JWT-token
  } catch (err) {
    console.error('❌ Misslyckades logga in till Helix:', err.response?.data || err.message);
    throw err;
  }
}

async function sendTestResults(token, testData) {
  try {
    const response = await axios.post(`${HELIX_URL}/api/arsys/v1/entry/${HELIX_FORM}`, testData, {
      headers: {
        Authorization: `AR-JWT ${token}`,
        'Content-Type': 'application/json'
      }
    });
    console.log(`✅ Resultat skickat till Helix! ID: ${response.data.entryId}`);
  } catch (err) {
    console.error('❌ Fel vid POST till Helix:', err.response?.data || err.message);
    throw err;
  }
}

async function main() {
  const resultsPath = path.join(__dirname, '../cypress/results.json');
  const screenshotsDir = path.join(__dirname, '../cypress/screenshots');
  const reportsDir = path.join(__dirname, '../cypress/reports');

  if (!fs.existsSync(resultsPath)) {
    console.error(`❌ Filen ${resultsPath} finns inte. Har Cypress körts?`);
    process.exit(1);
  }

  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
  const runTime = new Date(results.stats?.end || Date.now()).toISOString();

  try {
    const token = await loginHelix();
    let count = 0;

    for (const result of results.results || []) {
      const file = result.file || 'okänd';

      for (const suite of result.suites || []) {
        for (const test of suite.tests || []) {
          const testName = test.title || 'okänd';
          const fullTitle = test.fullTitle || test.title;
          const SuiteTitle = test.SuiteTitle || test.title;
          const status = test.state || (test.pass ? 'passed' : 'failed');
          const duration = test.duration || 0;
          const suiteTitle = suite.title || '';
          const errorMessage = test.err?.message || '';

          // 📸 Leta efter screenshot
          let screenshotBase64 = '';
          if (status === 'failed' && fs.existsSync(screenshotsDir)) {
            const matchingScreenshot = findScreenshotFile(screenshotsDir, SuiteTitle, file);
            if (matchingScreenshot) {
              const imgBuffer = fs.readFileSync(matchingScreenshot);
              screenshotBase64 = imgBuffer.toString('base64');
            }
          }

          const payload = {
            values: {
              TestName: testName,
              FullTitle: fullTitle,
              Status: status,
              DurationMs: duration,
              RunTime: runTime,
              FileName: file,
              SuiteTitle: suiteTitle,
              ErrorMessage: errorMessage,
              ScreenshotBase64: screenshotBase64 // 📸 Lägg till Base64 screenshot här
            }
          };

          console.log(`📤 Skickar: ${payload.values.TestName} (${payload.values.Status})`);
          await sendTestResults(token, payload);
          count++;
        }
      }
    }

    console.log(`✅ Totalt ${count} testresultat skickades till Helix.`);

    // 🧹 Städar upp efter lyckad körning
    if (fs.existsSync(resultsPath)) {
      fs.unlinkSync(resultsPath);
      console.log('🗑️  Tog bort results.json');
    }

    if (fs.existsSync(reportsDir)) {
      fs.readdirSync(reportsDir).forEach(file => {
        if (file.startsWith('mochawesome') && file.endsWith('.json')) {
          const fullPath = path.join(reportsDir, file);
          fs.unlinkSync(fullPath);
          console.log(`🗑️  Tog bort ${file}`);
        }
      });
    }

  } catch (err) {
    console.error('❌ Något gick fel under processen:', err.message);
  }
}

// 📸 Hjälpfunktion för att hitta rätt screenshot baserat på testnamn
function findScreenshotFile(baseDir, fullTitle, specFile) {
  const normalizedTitle = fullTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const normalizedSpec = path.basename(specFile).replace(/\.[^/.]+$/, '').toLowerCase();
  const specDir = path.join(baseDir, normalizedSpec);

  if (!fs.existsSync(specDir)) return null;

  const files = fs.readdirSync(specDir);
  const match = files.find(file => file.toLowerCase().includes(normalizedTitle));
  if (match) {
    return path.join(specDir, match);
  }
  return null;
}

main();
