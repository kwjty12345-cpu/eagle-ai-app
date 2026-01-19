# 1. 使用官方 Puppeteer 镜像
FROM ghcr.io/puppeteer/puppeteer:21.5.2

# 2. 设置环境变量
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable \
    TZ=Asia/Kuala_Lumpur

WORKDIR /usr/src/app

# 3. 切换到 root 用户
USER root

# 4. 🔥关键修改：从 backend 文件夹复制 package.json
COPY backend/package*.json ./

# 5. 安装依赖 (此时根目录下已有 package.json)
RUN npm install

# 6. 🔥关键修改：将 backend 文件夹内的所有代码复制到容器根目录
COPY backend/ .

# 7. 再次确保权限 (可选)
RUN chown -R pptruser:pptruser /usr/src/app

# 8. 切回普通用户
USER pptruser

# 9. 启动命令 (因为代码已经从 backend 拿出来了，所以直接运行 server.js)
CMD [ "node", "server.js" ]