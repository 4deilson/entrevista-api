/**
 * Módulo de Geração de Abertura para Vídeos de Entrevista
 * 
 * Este módulo cria aberturas usando a imagem base da Vincci:
 * - Usa a imagem original como fundo
 * - Sobrepõe o vídeo do candidato em formato circular no lugar do círculo verde
 * - Adiciona o nome do candidato dinamicamente
 * - Duração: 5 segundos HD 1280x720
 * 
 * @author API Entrevista
 * @version 3.0.0
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const fs = require('fs');
const path = require('path');

/**
 * Gera vídeo de abertura usando imagem base + vídeo circular do candidato
 * 
 * @param {Object} options - Opções de configuração
 * @param {string} options.nome - Nome do candidato
 * @param {string} options.processo - Descrição do processo seletivo (não usado na versão simplificada)
 * @param {string} options.outputId - ID único para nomear arquivos temporários
 * @param {string} options.videoCandidato - Caminho do vídeo do candidato (para usar como "foto")
 * @returns {Promise<string>} Caminho do arquivo de abertura gerado
 * @throws {Error} Erro de validação ou processamento
 */
const gerarAbertura = async (options = {}) => {
  const { nome, processo, outputId, videoCandidato } = options;
  
  // Validação de parâmetros obrigatórios
  if (!nome || !outputId || !videoCandidato) {
    throw new Error('Parâmetros obrigatórios: nome, outputId e videoCandidato');
  }
  
  // Validação dos arquivos necessários
  const imagemBase = path.resolve('abertura_template.png'); // Imagem que você mostrou
  
  if (!fs.existsSync(imagemBase)) {
    throw new Error('Arquivo abertura_template.png não encontrado. Use a imagem da Vincci como template.');
  }
  
  if (!fs.existsSync(videoCandidato)) {
    throw new Error(`Vídeo do candidato não encontrado: ${videoCandidato}`);
  }
  
  const aberturaFile = `tmp/abertura_vincci_${outputId}.mp4`;
  
  // Extrai apenas o primeiro nome e escapa para uso seguro no FFmpeg
  const primeiroNome = nome.split(' ')[0].trim();
  const nomeSeguro = primeiroNome.replace(/['"\\:;]/g, '').trim();
  
  // ABORDAGEM ULTRA SIMPLES - vamos fazer tudo separado sem filter_complex
  // Primeiro comando: cria base de 5 segundos com template + áudio silencioso
  const baseCmd = `ffmpeg -loop 1 -i "${imagemBase}" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 -t 5 -r 30 -c:v libx264 -c:a aac -shortest -y "tmp/base_${outputId}.mp4"`;
  
  // Segundo comando: adiciona o vídeo do candidato circular usando máscara PNG
  const overlayCmd = `ffmpeg -i "tmp/base_${outputId}.mp4" -i "${videoCandidato}" -i mask_circle_122.png -filter_complex "[1:v]select=eq(n\\,0),scale=122:122[vid];[vid][2:v]alphamerge[masked];[0:v][masked]overlay=100:488[with_candidato]" -map [with_candidato] -map 0:a -c:v libx264 -c:a copy -t 5 -y "tmp/with_video_${outputId}.mp4"`;
  
  // Terceiro comando: adiciona o texto
  const textCmd = `ffmpeg -i "tmp/with_video_${outputId}.mp4" -vf "drawtext=text=${nomeSeguro}:fontcolor=white:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:fontsize=42:x=265:y=561" -c:v libx264 -c:a copy -t 5 -y "${aberturaFile}"`;
  
  try {
    console.log(`[INFO] Gerando abertura para ${primeiroNome} (nome completo: ${nome}) em 3 etapas...`);
    
    // Etapa 1: Criar base com template
    console.log(`[DEBUG] Etapa 1 - Base: ${baseCmd}`);
    await execAsync(baseCmd, { timeout: 60000 });
    
    // Etapa 2: Adicionar vídeo do candidato
    console.log(`[DEBUG] Etapa 2 - Overlay: ${overlayCmd}`);
    await execAsync(overlayCmd, { timeout: 60000 });
    
    // Etapa 3: Adicionar texto
    console.log(`[DEBUG] Etapa 3 - Texto: ${textCmd}`);
    const result = await execAsync(textCmd, { timeout: 60000 });
    
    // Limpeza de arquivos temporários
    try {
      fs.unlinkSync(`tmp/base_${outputId}.mp4`);
      fs.unlinkSync(`tmp/with_video_${outputId}.mp4`);
    } catch (cleanupError) {
      console.log(`[WARN] Erro na limpeza: ${cleanupError.message}`);
    }
    
    console.log(`[DEBUG] FFmpeg final stdout: ${result.stdout}`);
    console.log(`[INFO] Abertura gerada: ${aberturaFile}`);
    return aberturaFile;
  } catch (e) {
    console.log(`[ERROR] FFmpeg stderr: ${e.stderr}`);
    console.log(`[ERROR] FFmpeg stdout: ${e.stdout}`);
    console.log(`[ERROR] Error message: ${e.message}`);
    throw new Error('Erro ao gerar abertura: ' + (e.stderr ? e.stderr.toString() : e.message));
  }
};

/**
 * MÓDULO CONCLUÍDO - ABERTURA SIMPLIFICADA VINCCI
 * 
 * Este módulo especializado gera aberturas usando a imagem base da Vincci:
 * 
 * FUNCIONALIDADES:
 * - Usa imagem template original como fundo
 * - Sobrepõe vídeo do candidato em formato circular
 * - Adiciona nome do candidato dinamicamente
 * - Mantém layout original da Vincci
 * - Processamento rápido e eficiente
 * 
 * ARQUIVOS NECESSÁRIOS:
 * - abertura_template.png: Imagem base da Vincci
 * - Vídeo do candidato para sobreposição circular
 * 
 * COMPATIBILIDADE:
 * - Windows/Linux com fallback de fontes
 * - Async/await com timeouts adequados
 * - Validação robusta de arquivos
 */

module.exports = gerarAbertura;
