// server.js

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const baixarVideo = require('./baixarVideo');
const processarVideos = require('./processarVideos');
const validarVideos = require('./validarVideos');

const app = express();
app.use(express.json());

// Cria pastas necessárias
if (!fs.existsSync('tmp')) fs.mkdirSync('tmp');
if (!fs.existsSync('output')) fs.mkdirSync('output');

// Controle de jobs
const jobs = {};
const MAX_CONCURRENT_JOBS = 10;
let currentProcessingJobs = 0;
const jobQueue = [];
const JOB_TIMEOUT = 15 * 60 * 1000;

// Reset jobs travados (CORRIGIDO)
setInterval(() => {
  const now = Date.now();
  let resetCount = 0;
  Object.keys(jobs).forEach(jobId => {
    const job = jobs[jobId];
    if (job.timestamp && (now - job.timestamp) > JOB_TIMEOUT) {
      if (job.status === 'baixando' || job.status === 'processando' || job.status === 'na_fila') {
        jobs[jobId] = {
          ...job,
          status: 'erro',
          erro: 'Job travou - timeout após 15 minutos',
          timestamp: Date.now(),
          error_time: new Date().toISOString()
        };
        resetCount++;
        
        // IMPORTANTE: Se job estava processando, decrementa o contador
        if (job.status === 'baixando' || job.status === 'processando') {
          currentProcessingJobs = Math.max(0, currentProcessingJobs - 1);
          console.log(`🔄 Job ${jobId} resetado - liberando slot (${currentProcessingJobs}/${MAX_CONCURRENT_JOBS})`);
        }
      }
    }
  });
  if (resetCount > 0) {
    console.log(`🔄 ${resetCount} jobs resetados`);
    // Tenta processar jobs pendentes após reset
    setImmediate(() => {
      while (currentProcessingJobs < MAX_CONCURRENT_JOBS && jobQueue.length > 0) {
        processarProximoJob();
      }
    });
  }
}, 5 * 60 * 1000);

// Monitor de memória
setInterval(() => {
  const memUsage = process.memoryUsage();
  if (memUsage.heapUsed > 500 * 1024 * 1024 && global.gc) {
    global.gc();
  }
}, 10 * 60 * 1000);

// Processa jobs da fila (VERSÃO ASSÍNCRONA CORRIGIDA)
async function processarProximoJob() {
  console.log(`🔍 processarProximoJob chamado: current=${currentProcessingJobs}, max=${MAX_CONCURRENT_JOBS}, queue=${jobQueue.length}`);
  
  if (currentProcessingJobs >= MAX_CONCURRENT_JOBS) {
    console.log(`⏸️ Limite atingido: ${currentProcessingJobs}/${MAX_CONCURRENT_JOBS}`);
    return;
  }
  
  if (jobQueue.length === 0) {
    console.log(`📭 Fila vazia`);
    return;
  }
  
  const jobData = jobQueue.shift();
  currentProcessingJobs++;
  
  console.log(`▶️ Iniciando job ${jobData.job_id} (${currentProcessingJobs}/${MAX_CONCURRENT_JOBS})`);
  
  // EXECUTA O JOB EM BACKGROUND - NÃO BLOQUEIA
  processarJobAssincrono(jobData).finally(() => {
    currentProcessingJobs--;
    console.log(`🔄 Job ${jobData.job_id} liberado (${currentProcessingJobs}/${MAX_CONCURRENT_JOBS})`);
    // Tenta processar próximo job
    setImmediate(processarProximoJob);
  });
}

// Processamento assíncrono individual de cada job
async function processarJobAssincrono(jobData) {
  const { job_id, videos, nome, processo } = jobData;
  let inputPaths = [];
  
  console.log(`🎬 Executando job ${job_id} em background`);
  
  try {
    // Atualiza status para baixando
    jobs[job_id] = { 
      status: 'baixando', 
      timestamp: Date.now(),
      created: jobs[job_id].created 
    };

    // Downloads paralelos com Promise.all e timeout
    const downloadPromises = videos.map(async (videoUrl, index) => {
      const filename = path.join('tmp', `tmp_${job_id}_${index + 1}.mp4`);
      
      // Timeout para cada download individual
      const downloadWithTimeout = Promise.race([
        baixarVideo(videoUrl, filename),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Download timeout - 60s')), 60000)
        )
      ]);
      
      await downloadWithTimeout;
      
      // Verificação assíncrona do arquivo - apenas verifica se existe
      const stats = await fs.promises.stat(filename);
      if (!stats || stats.size === 0) {
        throw new Error(`Arquivo baixado inválido: ${filename}`);
      }
      return filename;
    });

    // Executa todos os downloads simultaneamente
    inputPaths = await Promise.all(downloadPromises);

    // Processamento com timeout
    jobs[job_id] = { 
      status: 'processando', 
      timestamp: Date.now(),
      created: jobs[job_id].created 
    };
    
    // Timeout para processamento FFmpeg (20 minutos)
    const processamentoComTimeout = Promise.race([
      processarVideos(inputPaths, { nome, processo }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Processamento timeout - 45min')), 45 * 60 * 1000)
      )
    ]);
    
    const output = await processamentoComTimeout;
    
    // Move para output (usando copy + unlink para evitar EXDEV)
    const finalOutputPath = path.join('output', `video_${job_id}.mp4`);
    try {
      await fs.promises.copyFile(output, finalOutputPath);
      await fs.promises.unlink(output);
    } catch (copyError) {
      // Fallback: tenta rename direto se copy falhar
      try {
        await fs.promises.rename(output, finalOutputPath);
      } catch (renameError) {
        throw new Error(`Erro ao mover arquivo: ${copyError.message} / ${renameError.message}`);
      }
    }
    
    // Limpa arquivos temporários
    await Promise.all(inputPaths.map(async (file) => {
      try { 
        await fs.promises.unlink(file); 
      } catch (e) {}
    }));
    
    // Marca como concluído
    jobs[job_id] = { 
      status: 'feito', 
      output: finalOutputPath,
      timestamp: Date.now(),
      created: jobs[job_id].created,
      completed: new Date().toISOString()
    };
    console.log(`✅ Job ${job_id} finalizado`);
    
  } catch (err) {
    console.error(`❌ Erro no job ${job_id}:`, err.message);
    jobs[job_id] = { 
      status: 'erro', 
      erro: err.message,
      timestamp: Date.now(),
      created: jobs[job_id]?.created,
      error_time: new Date().toISOString()
    };
    
    // Limpa arquivos temporários (assíncrono)
    await Promise.all(inputPaths.map(async (file) => {
      try { 
        await fs.promises.unlink(file); 
      } catch (e) {}
    }));
  }
}

// Health check
app.get('/api/status/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime() 
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Ping rápido - sempre responde imediatamente
app.get('/ping', (req, res) => {
  res.json({ 
    pong: true, 
    timestamp: Date.now(),
    server_active: true
  });
});

// Criar job de entrevista
app.post('/api/entrevista', async (req, res) => {
  const { videos, nome, processo, processo_candidato_bubble_id } = req.body;

  if (!videos || !Array.isArray(videos) || videos.length < 2) {
    return res.status(400).json({ error: 'Envie ao menos dois vídeos no array "videos"' });
  }

  if (!nome || typeof nome !== 'string' || nome.trim() === '') {
    return res.status(400).json({ error: 'Campo "nome" é obrigatório e deve ser uma string não vazia' });
  }

  if (!processo || typeof processo !== 'string' || processo.trim() === '') {
    return res.status(400).json({ error: 'Campo "processo" é obrigatório e deve ser uma string não vazia' });
  }

  // Valida URLs (assíncrono e rápido)
  try {
    const validacoes = await Promise.race([
      validarVideos(videos),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Validação timeout')), 5000)
      )
    ]);
    
    const invalidos = validacoes.filter(v => !v.valido);
    if (invalidos.length > 0) {
      return res.status(400).json({ error: 'URLs inválidas', invalidos });
    }
  } catch (validationError) {
    return res.status(400).json({ 
      error: 'Erro na validação de URLs', 
      message: validationError.message 
    });
  }

  const job_id = uuidv4();
  
  jobs[job_id] = { 
    status: 'na_fila', 
    timestamp: Date.now(),
    created: new Date().toISOString(),
    position: jobQueue.length + 1,
    nome,
    processo,
    processo_candidato_bubble_id: processo_candidato_bubble_id || null
  };
  
  jobQueue.push({ job_id, videos, nome, processo, processo_candidato_bubble_id });
  console.log(`📋 Job ${job_id} criado`);
  
  res.json({ 
    job_id,
    status: 'na_fila',
    position: jobQueue.length,
    estimated_wait_minutes: Math.ceil(jobQueue.length * 2)
  });

  // Processa jobs disponíveis imediatamente
  setImmediate(() => {
    console.log(`🚀 Tentando processar jobs: current=${currentProcessingJobs}, max=${MAX_CONCURRENT_JOBS}, queue=${jobQueue.length}`);
    while (currentProcessingJobs < MAX_CONCURRENT_JOBS && jobQueue.length > 0) {
      console.log(`🔄 Processando próximo job... (${currentProcessingJobs}/${MAX_CONCURRENT_JOBS})`);
      processarProximoJob();
    }
    console.log(`📊 Estado final: current=${currentProcessingJobs}, queue=${jobQueue.length}`);
  });
});

// Status do job
app.get('/api/status/:job_id', (req, res) => {
  const startTime = Date.now();
  const job_id = req.params.job_id;
  
  if (!job_id || typeof job_id !== 'string') {
    return res.status(400).json({ error: 'Job ID inválido' });
  }
  
  const job = jobs[job_id];
  if (!job) {
    return res.status(404).json({ error: 'Job não encontrado' });
  }
  
  const responseTime = Date.now() - startTime;
  
  if (job.status === 'feito') {
    return res.json({ 
      status: 'feito', 
      download: `/api/download/${job_id}`,
      completed: job.completed,
      response_time_ms: responseTime
    });
  }
  
  if (job.status === 'erro') {
    return res.json({
      status: 'erro',
      erro: job.erro,
      error_time: job.error_time,
      response_time_ms: responseTime
    });
  }
  
  let queuePosition = null;
  if (job.status === 'na_fila') {
    const jobIndex = jobQueue.findIndex(j => j.job_id === job_id);
    queuePosition = jobIndex >= 0 ? jobIndex + 1 : null;
  }
  
  res.json({
    job_id: job_id,
    status: job.status,
    created: job.created,
    queue_position: queuePosition,
    current_processing_jobs: currentProcessingJobs,
    max_concurrent_jobs: MAX_CONCURRENT_JOBS,
    queue_length: jobQueue.length,
    response_time_ms: responseTime
  });
});

// Stats rápidas
app.get('/api/stats', (req, res) => {
  const stats = { na_fila: 0, baixando: 0, processando: 0, feito: 0, erro: 0 };
  
  Object.values(jobs).forEach(job => {
    stats[job.status] = (stats[job.status] || 0) + 1;
  });
  
  res.json({
    total_jobs: Object.keys(jobs).length,
    by_status: stats,
    current_processing: currentProcessingJobs,
    queue_length: jobQueue.length,
    success_rate: stats.feito + stats.erro > 0 ? 
      Math.round((stats.feito / (stats.feito + stats.erro)) * 100) : 0
  });
});

// Debug do sistema (NOVO)
app.get('/api/debug', (req, res) => {
  const activeJobs = Object.entries(jobs)
    .filter(([_, job]) => job.status === 'baixando' || job.status === 'processando')
    .map(([id, job]) => ({
      job_id: id,
      status: job.status,
      age_seconds: Math.round((Date.now() - job.timestamp) / 1000)
    }));

  // Verifica consistência
  const realActiveCount = activeJobs.length;
  const counterMismatch = realActiveCount !== currentProcessingJobs;

  res.json({
    currentProcessingJobs,
    real_active_jobs: realActiveCount,
    counter_mismatch: counterMismatch,
    MAX_CONCURRENT_JOBS,
    jobQueue_length: jobQueue.length,
    active_jobs: activeJobs,
    memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    uptime_minutes: Math.round(process.uptime() / 60),
    last_jobs: Object.entries(jobs).slice(-5).map(([id, job]) => ({
      job_id: id,
      status: job.status,
      age_seconds: Math.round((Date.now() - job.timestamp) / 1000)
    }))
  });
});

// Download do vídeo (ASSÍNCRONO)
app.get('/api/download/:job_id', async (req, res) => {
  const job = jobs[req.params.job_id];
  if (!job || job.status !== 'feito') {
    return res.status(400).json({ error: 'Vídeo ainda não está pronto ou ocorreu erro' });
  }
  
  const filePath = path.join(__dirname, job.output);
  
  try {
    // Verificação assíncrona da existência do arquivo
    await fs.promises.access(filePath);
    res.download(filePath, `entrevista_${req.params.job_id}.mp4`);
  } catch (error) {
    res.status(404).json({ error: 'Arquivo de vídeo não encontrado' });
  }
});

// Limpeza da pasta tmp (ASSÍNCRONA)
app.post('/api/cleanup', async (req, res) => {
  try {
    const tmpDir = path.join(__dirname, 'tmp');
    const files = await fs.promises.readdir(tmpDir);
    let removedCount = 0;
    
    // Remove arquivos em paralelo
    await Promise.all(files.map(async (file) => {
      try {
        const filePath = path.join(tmpDir, file);
        await fs.promises.unlink(filePath);
        removedCount++;
      } catch (e) {}
    }));
    
    res.json({ message: `Limpeza concluída. ${removedCount} arquivos removidos da pasta tmp.` });
  } catch (err) {
    res.status(500).json({ error: 'Erro na limpeza da pasta tmp' });
  }
});

app.listen(3000, () => console.log('API pronta para receber vídeos. Porta 3000'));
