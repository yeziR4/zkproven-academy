FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
COPY courses ./courses
COPY build/exam.wasm build/exam_final.zkey build/exam_vk.json ./build/
# /data is a platform-managed persistent volume. Answer keys come from COURSE_KEY_* secrets.
ENV NODE_ENV=production DATA_DIR=/data PORT=8080
EXPOSE 8080
CMD ["node", "src/server.js"]
