// validarVideos.js
const axios = require('axios');

const validarVideos = async (urls) => {
  if (!Array.isArray(urls)) throw new Error('Esperado um array de URLs');

  // Validação simplificada - apenas verifica se a URL parece válida
  const resultados = urls.map((url) => {
    try {
      new URL(url); // Verifica se é uma URL válida
      const valido = url.startsWith('http://') || url.startsWith('https://');
      return { url, valido };
    } catch (err) {
      return { url, valido: false };
    }
  });

  return resultados;
};

module.exports = validarVideos;
// ...código do validarVideos.js movido da pasta modules...
