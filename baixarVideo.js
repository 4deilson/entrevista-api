const https = require('https');
const http = require('http');
const fs = require('fs');

async function baixarVideo(url, filename) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filename);
    const protocol = url.startsWith('https:') ? https : http;
    
    // Timeout geral do download (30 segundos)
    const globalTimeout = setTimeout(() => {
      file.close();
      fs.unlink(filename, () => {});
      reject(new Error('Timeout no download após 30 segundos'));
    }, 30000);
    
    const request = protocol.get({
      ...require('url').parse(url),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    }, (response) => {
      if (response.statusCode !== 200) {
        file.close();
        fs.unlink(filename, () => {});
        clearTimeout(globalTimeout);
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }
      
      response.pipe(file);
      file.on('finish', () => {
        clearTimeout(globalTimeout);
        file.close(() => {
          resolve();
        });
      });
    }).on('error', (err) => {
      console.log(`❌ Erro no download: ${err.message}`);
      clearTimeout(globalTimeout);
      file.close();
      fs.unlink(filename, () => {});
      reject(err);
    });
    
    // Timeout para a conexão inicial (10 segundos)
    request.setTimeout(10000, () => {
      request.destroy();
      clearTimeout(globalTimeout);
      file.close();
      fs.unlink(filename, () => {});
      reject(new Error('Timeout na conexão'));
    });
  });
}

module.exports = baixarVideo;
