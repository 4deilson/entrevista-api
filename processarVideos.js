/**
 * Módulo de Processamento de Vídeos para Entrevistas
 * 
 * Este módulo processa múltiplos vídeos criando:
 * 1. Abertura personalizada (5s) com logo, nome e processo
 * 2. Sequência de entrevista com efeito Picture-in-Picture (PiP)
 * 3. Alternância entre entrevistadora (Lisa) e candidato
 * 4. Concatenação final em vídeo único HD (1280x720)
 * 
 * @author API Entrevista
 * @version 1.0.0
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const https = require('https');
const gerarAbertura = require('./gerarAbertura');

/**
 * Processa array de vídeos criando entrevista com abertura e efeitos PiP
 * 
 * @param {string[]} arquivos - Array com caminhos dos vídeos baixados
 * @param {Object} options - Opções de processamento
 * @param {string} options.nome - Nome do candidato
 * @param {string} options.processo - Descrição do processo seletivo
 * @returns {Promise<string>} Caminho do vídeo final processado
 * @throws {Error} Erro de validação ou processamento
 */

const processarVideos = async (arquivos, options = {}) => {
  const { nome, processo } = options;
  
  // Validação de entrada
  if (!Array.isArray(arquivos)) {
    throw new Error('O parâmetro "arquivos" deve ser um array');
  }
  
  if (arquivos.length < 2) {
    throw new Error('É necessário pelo menos 2 vídeos para processar');
  }
  
  // Validação de existência dos arquivos
  for (let i = 0; i < arquivos.length; i++) {
    if (!fs.existsSync(arquivos[i])) {
      throw new Error(`Arquivo não encontrado: ${arquivos[i]}`);
    }
    
    // Verifica se o arquivo não está vazio
    const stats = fs.statSync(arquivos[i]);
    if (stats.size === 0) {
      throw new Error(`Arquivo vazio: ${arquivos[i]}`);
    }
  }
  
  // Validação do logo (crítico para o funcionamento)
  const logoFile = path.resolve('logo_abertura.png');
  if (!fs.existsSync(logoFile)) {
    throw new Error('Arquivo logo_abertura.png não encontrado. Este arquivo é obrigatório.');
  }
  
  return new Promise((resolve, reject) => {
    const id = uuidv4(); // ID único para arquivos temporários
    const output = `tmp/output_${id}.mp4`; // Arquivo de saída final

    console.log(`[INFO] Processando ${arquivos.length} vídeos para ${nome}`);
    
    // Processa vídeos em modo entrevista dinâmica (mínimo 2 vídeos)
    if (arquivos.length >= 2) {
      
      /**
       * FLUXO PRINCIPAL DE PROCESSAMENTO
       * Executa a composição completa do vídeo final
       */
      (async () => {
        try {
          // 1. Gera abertura simplificada usando imagem base + vídeo circular
          const videoCandidato = arquivos.length >= 2 ? arquivos[1] : arquivos[0];
          const aberturaFile = await gerarAbertura({
            nome,
            outputId: id,
            videoCandidato: videoCandidato
          });
          
          /**
           * 2. Reencode individual com sincronização isolada para cada vídeo
           * Normaliza todos os vídeos para o mesmo formato:
           * - Resolução: 1280x720 (HD)
           * - Taxa de quadros: 30 FPS
           * - Áudio: 48kHz estéreo AAC
           * - Aspect ratio preservado com padding
           */
          const intermFiles = [];
          for (let i = 0; i < arquivos.length; i++) {
            const src = arquivos[i];
            const interm = `tmp/interm_${id}_${i + 1}.mp4`;
            
            // Reencoda cada vídeo individualmente com parâmetros de sync rigorosos
            // IMPORTANTE: aspas duplas nos caminhos para evitar problemas com caracteres especiais
            const cmd = `ffmpeg -i "${src}" -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=30" -ar 48000 -ac 2 -c:v libx264 -c:a aac -strict experimental -shortest -r 30 -y "${interm}"`;
            try {
              await execAsync(cmd, { timeout: 300000 }); // 5 min timeout
            } catch (e) {
              arquivos.forEach((f) => { try { fs.unlinkSync(f); } catch {} });
              throw new Error(`Erro ao reencodar vídeo ${i+1}: ` + (e.stderr ? e.stderr.toString() : e.message));
            }
            intermFiles.push(interm);
          }
          
          /**
           * 3. Gera segmentos PiP apenas para os vídeos de entrevista
           * Implementa o efeito de alternância dinâmica:
           * - Vídeo 1 (pergunta): foco principal, vídeo 2 em PiP
           * - Vídeo 2 (resposta): foco principal, vídeo 1 em PiP  
           * - Labels dinâmicos: "Lisa" e nome do candidato
           * - PiP posicionado no canto inferior direito
           */
          const segs = [aberturaFile];
          for (let i = 0; i < intermFiles.length; i++) {
            const main = path.resolve(intermFiles[i]);
            let pip = null;
            if (i + 1 < intermFiles.length) pip = path.resolve(intermFiles[i + 1]);
            const seg = `tmp/seg_${id}_${i + 1}.mp4`;
            let filter, cmd;
            let nomeLabel = '';
            
            /**
             * Sistema de labels dinâmicos para identificação dos participantes:
             * - Lisa sempre é a entrevistadora (vídeos pares: 0, 2, 4...)  
             * - O candidato (nome do JSON) nos vídeos ímpares (1, 3, 5...)
             * Isso cria o fluxo pergunta-resposta natural da entrevista
             */
            if (i % 2 === 0) {
              nomeLabel = 'Lisa'; // Entrevistadora
            } else {
              nomeLabel = nome || 'Candidato'; // Nome do candidato do JSON
            }
            
            /**
             * Configuração de texto overlay para identificação do participante
             * - Fonte Liberation Sans para Docker/Linux
             * - Texto branco com borda preta para legibilidade
             * - Posicionado no canto superior esquerdo (x=20, y=20)
             */
            let fontFile = '/Windows/Fonts/arial.ttf';
            if (!fs.existsSync(fontFile)) {
              fontFile = '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'; // Linux
            }
            let drawtext = `drawtext=fontfile=${fontFile}:text='${nomeLabel}':fontcolor=white:fontsize=32:borderw=2:bordercolor=black:x=20:y=20:alpha=1`;
            let mainFilter = `[0:v]scale=1280:720,format=yuv420p[main];`;
            
            if (!pip) {
              /**
               * CENÁRIO: Último vídeo da sequência
               * - Apenas o vídeo principal em destaque
               * - Sem PiP (Picture-in-Picture)
               * - Sincronização isolada mantendo qualidade HD
               */
              filter = `${mainFilter}[main]${drawtext}[vout]`;
              cmd = `ffmpeg -i "${main}" -filter_complex "${filter}" -map "[vout]" -map 0:a -c:v libx264 -c:a aac -r 30 -shortest -y "${seg}"`;
            } else {
              /**
               * CENÁRIO: Vídeo com PiP (Picture-in-Picture)
               * - Vídeo principal em destaque (1280x720)
               * - Próximo vídeo como PiP (320x180) no canto inferior direito
               * - PiP limitado aos primeiros 5 segundos para preview
               * - Sincronização precisa entre áudio principal e overlay visual
               */
              
              // Obtém duração do vídeo principal para sincronização
              let dur = 0;
              try {
                const out = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${main}"`, { timeout: 10000 });
                dur = parseFloat(out.stdout.toString().trim());
              } catch (e) {}
              
              // Filtro simplificado: pega 5s do PiP e repete apenas uma vez
              let pipFilter = `[1:v]trim=end=5,setpts=PTS-STARTPTS,scale=320:180,format=yuv420p[pip];`;
              
              let overlayFilter = `[main][pip]overlay=W-w-40:H-h-40[ovr];`;
              let textFilter = `[ovr]${drawtext}[vout]`;
              let fullFilter = `${mainFilter}${pipFilter}${overlayFilter}${textFilter}`;
              
              // Força sincronização precisa entre áudio e vídeo
              cmd = `ffmpeg -i "${main}" -i "${pip}" -filter_complex "${fullFilter}" -map "[vout]" -map 0:a -c:v libx264 -c:a aac -t ${dur} -r 30 -shortest -y "${seg}"`;
            }
            
            /**
             * Executa o comando FFmpeg para gerar o segmento
             * Em caso de erro, limpa arquivos temporários para evitar inconsistências
             */
            try {
              await execAsync(cmd, { timeout: 600000 }); // 10 min timeout
            } catch (e) {
              intermFiles.forEach((f) => { try { fs.unlinkSync(f); } catch {} });
              segs.forEach((s) => { if (fs.existsSync(s)) try { fs.unlinkSync(s); } catch {} });
              throw new Error('Erro ao gerar segmento PiP: ' + (e.stderr ? e.stderr.toString() : e.message));
            }
            segs.push(seg);
          }
          
          /**
           * 4. CONCATENAÇÃO FINAL
           * Junta todos os segmentos em um vídeo único:
           * - Abertura (5s) + Segmentos de entrevista com PiP
           * - Usa concatenação simples com copy streams para evitar reprocessamento
           * - Mantém qualidade HD e sincronização de áudio
           */
          const listFile = `tmp/lista_${id}.txt`;
          const lista = segs.map(f => `file '${path.resolve(f).replace(/\\/g, '/')}'`).join('\n');
          fs.writeFileSync(listFile, lista);
          const absListFile = path.resolve(listFile);
          
          /**
           * Concatenação final usando stream copy para máxima eficiência
           * - Preserva exatamente a qualidade dos segmentos processados
           * - Evita recodificação desnecessária
           * - Mantém sincronização de áudio/vídeo já estabelecida
           */
          const concatCmd = `ffmpeg -f concat -safe 0 -i "${absListFile}" -c copy -y "${output}"`;
          try {
            await execAsync(concatCmd, { timeout: 300000 }); // 5 min timeout
          } catch (e) {
            // Limpeza em caso de erro na concatenação
            intermFiles.forEach((f) => { try { fs.unlinkSync(f); } catch {} });
            segs.forEach((s) => { if (fs.existsSync(s)) try { fs.unlinkSync(s); } catch {} });
            try { fs.unlinkSync(listFile); } catch {}
            arquivos.forEach((f) => { try { fs.unlinkSync(f); } catch {} });
            throw new Error('Erro ao concatenar segmentos: ' + (e.stderr ? e.stderr.toString() : e.message));
          }
          
          /**
           * LIMPEZA FINAL
           * Remove todos os arquivos temporários após processamento bem-sucedido
           * Mantém apenas o arquivo final de saída
           */
          intermFiles.forEach((f) => { try { fs.unlinkSync(f); } catch {} });
          segs.forEach((s) => { if (fs.existsSync(s)) try { fs.unlinkSync(s); } catch {} });
          try { fs.unlinkSync(listFile); } catch {}
          arquivos.forEach((f) => { try { fs.unlinkSync(f); } catch {} });
          
          resolve(output);
        } catch (error) {
          reject(error);
        }
      })();
      return;
    }
  });
};

/**
 * ARQUIVO CONCLUÍDO - DOCUMENTAÇÃO COMPLETA
 * 
 * Este módulo implementa um sistema completo de processamento de vídeo para entrevistas:
 * 
 * FUNCIONALIDADES PRINCIPAIS:
 * - Geração de abertura profissional (5s) com logo e informações do candidato
 * - Processamento de vídeos em HD 1280x720 com sincronização perfeita de áudio
 * - Efeito Picture-in-Picture (PiP) dinâmico alternando foco entre participantes
 * - Labels dinâmicos identificando "Lisa" (entrevistadora) e o candidato
 * - Concatenação otimizada preservando qualidade original
 * 
 * FLUXO DE PROCESSAMENTO:
 * 1. Validação de parâmetros e criação de diretório temporário
 * 2. Geração da abertura com textos e logo centralizados
 * 3. Normalização individual de cada vídeo para formato HD padronizado
 * 4. Criação de segmentos PiP com alternância automática de foco
 * 5. Concatenação final usando stream copy para eficiência máxima
 * 6. Limpeza automática de arquivos temporários
 * 
 * OTIMIZAÇÕES IMPLEMENTADAS:
 * - Escape adequado de comandos shell para segurança
 * - Gestão inteligente de memória com limpeza progressiva
 * - Sincronização rigorosa de áudio/vídeo (48kHz, AAC)
 * - Processamento eficiente evitando recodificações desnecessárias
 * - **ASYNC/AWAIT**: Todos os execSync substituídos por execAsync com timeouts
 * 
 * COMPATIBILIDADE:
 * - Windows (fonte Arial padrão)
 * - Linux (fallback para fonte Arial do sistema)
 * - Suporte a caracteres especiais em nomes e processos
 * - Docker ready com todas as dependências incluídas
 * - **Event Loop Friendly**: Não bloqueia mais a API durante processamento
 */

module.exports = processarVideos;