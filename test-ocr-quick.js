const fs = require('fs');
const path = require('path');

async function main() {
  const filePath = path.join(__dirname, 'backend', 'media', 'pdfs', 'OnBase_Audit_Questionnaire.pdf');
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    return;
  }
  
  const fileData = fs.readFileSync(filePath);
  console.log(`Testing OCR upload: ${fileData.length} bytes`);
  
  const boundary = '----FormBoundary' + Date.now();
  const parts = [];
  parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="OnBase_Audit_Questionnaire.pdf"\r\nContent-Type: application/pdf\r\n\r\n`);
  parts.push(fileData);
  parts.push(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="uploader"\r\n\r\ntest\r\n`);
  parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="overrideName"\r\n\r\nOCR-Test\r\n`);
  parts.push(`--${boundary}--\r\n`);
  
  const body = Buffer.concat(parts.map(p => typeof p === 'string' ? Buffer.from(p) : p));
  const start = Date.now();
  
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 300000);
    
    const resp = await fetch('http://localhost:3000/file/api/documents/create-from-upload', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body,
      signal: controller.signal,
    });
    
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`Status: ${resp.status} (${elapsed}s)`);
    
    const text = await resp.text();
    try {
      const json = JSON.parse(text);
      console.log('extractionStage:', json.extractionStage);
      console.log('ai:', json.ai);
      if (json.doc) {
        console.log('keywords:', json.doc.aiExtractedKeywords);
        console.log('summary:', (json.doc.aiSummary || '').slice(0, 150));
        console.log('text len:', (json.doc.fullSimulatedText || '').length);
      }
      if (json.error) console.log('ERROR:', json.error);
    } catch {
      console.log('Raw:', text.slice(0, 500));
    }
  } catch (e) {
    console.error(`Failed after ${((Date.now()-start)/1000).toFixed(1)}s:`, e.message);
  }
}

main();
