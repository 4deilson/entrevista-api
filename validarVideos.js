// validarVideos.js
const https = require('https');
const http = require('http');

const validarVideos = async (urls) => {
  if (!Array.isArray(urls)) throw new Error('Esperado um array de URLs');

  // Validação real com HEAD requests para verificar se o vídeo existe
  const validacoes = await Promise.allSettled(
    urls.map(async (url) => {
      try {
        // Valida formato da URL
        new URL(url);
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          return { url, valido: false, erro: 'URL deve começar com http:// ou https://' };
        }

        // Faz HEAD request para verificar se o recurso existe
        const protocol = url.startsWith('https:') ? https : http;
        
        return new Promise((resolve) => {
          const request = protocol.request(url, { method: 'HEAD', timeout: 5000 }, (response) => {
            const contentType = response.headers['content-type'] || '';
            const isVideo = contentType.startsWith('video/') || 
                           url.includes('.mp4') || 
                           url.includes('.avi') || 
                           url.includes('.mov');
            
            resolve({
              url,
              valido: response.statusCode >= 200 && response.statusCode < 400 && isVideo,
              statusCode: response.statusCode,
              contentType
            });
          });

          request.on('error', () => {
            resolve({ url, valido: false, erro: 'URL inacessível' });
          });

          request.on('timeout', () => {
            request.destroy();
            resolve({ url, valido: false, erro: 'Timeout na validação' });
          });

          request.end();
        });
      } catch (err) {
        return { url, valido: false, erro: 'URL inválida' };
      }
    })
  );

  return validacoes.map(result => result.status === 'fulfilled' ? result.value : 
    { url: 'unknown', valido: false, erro: 'Erro na validação' });
};

module.exports = validarVideos;
