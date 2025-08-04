# Use a imagem oficial do Node.js 20 com Ubuntu
FROM node:20

# Define variáveis de ambiente
ENV NODE_ENV=production
ENV DEBIAN_FRONTEND=noninteractive
ENV FONTCONFIG_PATH=/etc/fonts
ENV FONTCONFIG_FILE=/etc/fonts/fonts.conf

# Atualiza os repositórios e instala dependências do sistema
RUN apt-get update && apt-get install -y \
    # FFmpeg completo com todas as funcionalidades
    ffmpeg \
    # Fontes necessárias para drawtext
    fonts-dejavu-core \
    fonts-liberation \
    fonts-noto \
    fontconfig \
    # ImageMagick para criar logo temporário
    imagemagick \
    # Utilitários de rede e download
    curl \
    wget \
    # Ferramentas de sistema
    ca-certificates \
    # Limpeza do cache
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    # Gera cache de fontes globalmente
    && fc-cache -fv

# Verifica a instalação do FFmpeg
RUN ffmpeg -version

# Cria diretório de trabalho
WORKDIR /app

# Copia arquivos de dependências primeiro (para cache do Docker)
COPY package*.json ./

# Instala dependências do Node.js
RUN npm ci --only=production && npm cache clean --force

# Copia todo o código da aplicação
COPY . .

# Cria pastas necessárias com permissões apropriadas
RUN mkdir -p tmp output \
    && chmod 755 tmp output

# Cria usuário não-root para segurança
RUN groupadd -r appuser && useradd -r -g appuser appuser \
    && chown -R appuser:appuser /app

# Cria diretório home para o usuário com cache de fontes
RUN mkdir -p /home/appuser/.cache \
    && chown -R appuser:appuser /home/appuser

# Muda para usuário não-root
USER appuser

# Configura ambiente de fontes para o usuário
ENV HOME=/home/appuser
ENV XDG_CACHE_HOME=/home/appuser/.cache

# Expõe a porta da aplicação
EXPOSE 3000

# Health check para verificar se a aplicação está funcionando
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Comando padrão para iniciar a aplicação
CMD ["node", "server.js"]
