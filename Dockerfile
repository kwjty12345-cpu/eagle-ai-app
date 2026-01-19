# 使用官方的 Puppeteer 镜像 (自带 Chrome，不需要你安装那几百个库)
FROM ghcr.io/puppeteer/puppeteer:21.5.2

# 设置环境变量，告诉 Puppeteer 不要自己下载 Chrome，用镜像里自带的
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

ENV TZ=Asia/Kuala_Lumpur

WORKDIR /usr/src/app

# 切换到 root 用户来安装依赖 (因为 puppeteer 镜像默认是 pptruser)
USER root

# 复制 package.json 并安装依赖
COPY package*.json ./
RUN npm ci

# 复制其余代码
COPY . .

# 再次确保权限正确 (可选)
RUN chown -R pptruser:pptruser /usr/src/app

# 切回普通用户运行 (为了安全)
USER pptruser

# 启动命令
CMD [ "node", "index.js" ]