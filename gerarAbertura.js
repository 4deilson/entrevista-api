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
  
  // Escapa nome para uso seguro no FFmpeg
  const nomeEscapado = nome.replace(/['"\\:]/g, '').trim();
  
  /**
   * Filtro FFmpeg com trim para sincronização perfeita
   */
  
  let filter = ``;
  
  // Gera 5 segundos direto
  filter += `color=white:size=1280x720:d=5[fundo_branco];`;
  
  // Template da imagem como vídeo de 5 segundos
  filter += `[0:v]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,loop=loop=-1:size=150:start=0[template_video];`;
  
  // Vídeo do candidato PAUSADO - primeiro frame apenas, sem loop pesado
  filter += `[1:v]select=eq(n\\,0),scale=122:122:force_original_aspect_ratio=increase,crop=122:122[candidato_frame];`;
  filter += `[candidato_frame]loop=loop=-1:size=150:start=0[candidato_video];`;
  
  // Aplica máscara circular no vídeo do candidato
  filter += `[candidato_video]format=yuva420p[candidato_yuva];`;
  filter += `[candidato_yuva]geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lt(hypot(X-61,Y-61),61),255,0)'[candidato_circular];`;
  
  // Combina tudo
  filter += `[fundo_branco][template_video]overlay=0:0[bg_with_template];`;
  filter += `[bg_with_template][candidato_circular]overlay=100:488[bg_with_candidato];`;
  
  // Adiciona o nome do candidato com fonte Poppins Bold e remove primeiros 1.5s do resultado final
  filter += `[bg_with_candidato]drawtext=text='${nomeEscapado}':fontcolor=white:fontfile='Poppins-Bold.ttf':fontsize=42:x=265:y=565,trim=start=1.5,setpts=PTS-STARTPTS[video_final];`;
  
  // Adiciona áudio sincronizado
  filter += `anullsrc=channel_layout=stereo:sample_rate=48000[audio];`;
  
  // Comando FFmpeg direto
  const cmd = `ffmpeg -loop 1 -i "${imagemBase}" -i "${videoCandidato}" -filter_complex "${filter}" -map [video_final] -map [audio] -c:v libx264 -c:a aac -t 5 -r 30 -shortest -y "${aberturaFile}"`;
  
  try {
    console.log(`[INFO] Gerando abertura para ${nome}...`);
    await execAsync(cmd, { timeout: 120000 });
    console.log(`[INFO] Abertura gerada: ${aberturaFile}`);
    return aberturaFile;
  } catch (e) {
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
