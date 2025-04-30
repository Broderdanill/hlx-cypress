const fs = require('fs');
const path = require('path');

const inputDir = './recordings';
const outputDir = './cypress/e2e';
const logPath = './conversion.log';

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(logPath, line);
  console.log(line.trim());
}

function mapKey(key) {
  const keyMap = {
    Tab: 'Tab',
    Enter: 'Enter',
    Escape: 'Escape',
    Backspace: 'Backspace',
    ArrowUp: 'ArrowUp',
    ArrowDown: 'ArrowDown',
    ArrowLeft: 'ArrowLeft',
    ArrowRight: 'ArrowRight',
  };
  return keyMap[key] || key;
}

function chooseBestSelector(selectors) {
  if (!selectors || !selectors.length) return null;
  const flat = selectors.flat();
  const idSel = flat.find(s => s.startsWith('#'));
  const xpathSel = flat.find(s => s.startsWith('xpath/'));
  const ariaSel = flat.find(s => s.startsWith('aria/'));
  const pierceSel = flat.find(s => s.startsWith('pierce/'));
  const textSel = flat.find(s => s.startsWith('text/'));
  const genericSel = flat.find(s => s.length <= 4);
  return idSel || xpathSel || ariaSel || pierceSel || textSel || genericSel || flat[0];
}

function getSelectorCode(selector) {
  if (!selector) throw new Error('Saknar selector');
  if (selector.startsWith('xpath/')) {
    const xpath = selector.replace('xpath/', '').replace(/^\/+/, '');
    return `cy.xpath('//${xpath}', { timeout: 10000 })`;
  }
  return `cy.get('${selector}', { timeout: 10000 })`;
}

function wrapWithFrame(step, codeLine) {
  if (step.frame && step.frame.length > 0) {
    const frameIndex = step.frame[0];
    return `cy.get('iframe').eq(${frameIndex}).its('0.contentDocument.body').should('not.be.empty').then(cy.wrap).within(() => {\n      ${codeLine}\n    });`;
  }
  return codeLine;
}

const handlers = {
  setViewport: (step) => {
    if (!step.width || !step.height) throw new Error('setViewport saknar width eller height');
    return `cy.viewport(${step.width}, ${step.height});`;
  },
  navigate: (step) => {
    return `cy.visit('${step.url}');\n    cy.wait(2000); // Väntar på att JS ska ladda`;
  },
  click: (step, selector) => {
    if (!selector) throw new Error('click saknar selector');
    const base = getSelectorCode(selector);
    return wrapWithFrame(step, `${base}.should('exist').first().click();\n    cy.wait(1000);`);
  },
  doubleClick: (step, selector) => {
    const base = getSelectorCode(selector);
    return wrapWithFrame(step, `${base}.dblclick();\n    cy.wait(1000);`);
  },
  change: (step, selector) => {
    const base = getSelectorCode(selector);
    return wrapWithFrame(step, `${base}.clear().type('${step.value}');\n    cy.wait(1000);`);
  },
  keyDown: (step, selector) => {
    const key = mapKey(step.key);
    if (key === 'Tab' || key === 'Enter') {
      return `cy.realPress('${key}');\n    cy.wait(1000);`;
    }
    if (!selector) return `cy.realPress('${key}');`;
    const base = getSelectorCode(selector);
    return wrapWithFrame(step, `${base}.realType('${key}');\n    cy.wait(500);`);
  },
  keyUp: (step) => `// keyUp: ${step.key} (ignoreras)`,
  submit: (step, selector) => {
    const base = getSelectorCode(selector);
    return wrapWithFrame(step, `${base}.submit();\n    cy.wait(1000);`);
  },
  scroll: (step, selector) => {
    const base = getSelectorCode(selector);
    return wrapWithFrame(step, `${base}.scrollTo('${step.scrollPosition?.x || 0}', '${step.scrollPosition?.y || 0}');`);
  },
  hover: (step, selector) => {
    const base = getSelectorCode(selector);
    return wrapWithFrame(step, `${base}.trigger('mouseover');\n    cy.wait(500);`);
  },
  waitForElement: (step, selector) => {
    const base = getSelectorCode(selector);
    return wrapWithFrame(step, `${base}.should('exist');`);
  },
  assert: (step, selector) => {
    const base = getSelectorCode(selector);
    const assertion = step.assertion || 'exist';
    const value = step.value;
    return wrapWithFrame(step, value
      ? `${base}.should('${assertion}', '${value}');`
      : `${base}.should('${assertion}');`);
  }
};

fs.readdirSync(inputDir).forEach(file => {
  if (file.endsWith('.json')) {
    const inputPath = path.join(inputDir, file);
    const baseName = path.parse(file).name;
    const outputPath = path.join(outputDir, `${baseName}.cy.js`);

    try {
      const recording = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
      const steps = recording.steps || [];
      const recordingName = recording.title || baseName;

      let codeLines = [];
      codeLines.push("import 'cypress-xpath';");
      codeLines.push("import 'cypress-real-events/support';");
      codeLines.push(`describe('${recordingName}', () => {`);
      codeLines.push(`  it('${recordingName}', () => {`);

      if (recording.viewport && recording.viewport.width && recording.viewport.height) {
        const { width, height } = recording.viewport;
        codeLines.push(`    cy.viewport(${width}, ${height});`);
        log(`ℹ️ [${file}] Viewport satt till ${width}x${height}`);
      }

      steps.forEach((step, index) => {
        const selector = chooseBestSelector(step.selectors);
        if (handlers[step.type]) {
          try {
            const line = handlers[step.type](step, selector);
            codeLines.push(`    ${line}`);
          } catch (err) {
            log(`❌ [${file}] Steg ${index + 1} (${step.type}): ${err.message}`);
            codeLines.push(`    // ⚠️ Fel i ${step.type}: ${err.message}`);
          }
        } else {
          log(`❓ [${file}] Steg ${index + 1}: Ohanterad typ '${step.type}'`);
          codeLines.push(`    // ❓ Ohanterad stegtyp: ${step.type}`);
        }
      });

      codeLines.push(`  });`);
      codeLines.push(`});`);

      fs.writeFileSync(outputPath, codeLines.join('\n'), 'utf-8');
      fs.unlinkSync(inputPath);
      log(`✅ Konverterade och raderade: ${file}`);
    } catch (err) {
      log(`❌ Fel vid konvertering av ${file}: ${err.message}`);
    }
  }
});
