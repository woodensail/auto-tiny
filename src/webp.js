const WEBP = {
  checkWaterMark(buffer, text) {
    const searchStr = `Watermark:${text}`;
    let pos = 12;

    while (pos < buffer.length - 8) {
      const chunkType = buffer.toString('utf8', pos, pos + 4);
      const chunkSize = buffer.readUInt32LE(pos + 4);

      if (chunkType === 'EXIF' && chunkSize > 0) {
        const exifStart = pos + 8;
        const exifEnd = exifStart + chunkSize;
        const exifContent = buffer.toString('utf8', exifStart, exifEnd);

        if (exifContent.includes(searchStr)) {
          return true;
        }
      }

      pos += 8 + chunkSize;
    }

    return false;
  },
  insertWaterMark(buffer, text) {
    if (buffer.length < 12) {
      throw new Error('Buffer too small');
    }

    const riff = buffer.toString('utf8', 0, 4);
    const webp = buffer.toString('utf8', 8, 12);

    if (riff !== 'RIFF' || webp !== 'WEBP') {
      throw new Error('Invalid WebP format');
    }

    // 创建EXIF数据 - 使用固定的简单结构
    const exifData = Buffer.from(`Watermark:${text}`, 'utf8');

    // 查找文件中的chunks
    const chunks = [];
    let pos = 12; // WEBP签名之后

    while (pos < buffer.length - 8) {
      // 检查是否有足够的字节读取chunk头
      if (pos + 8 > buffer.length) break;

      const chunkType = buffer.toString('utf8', pos, pos + 4);
      const chunkSize = buffer.readUInt32LE(pos + 4);

      // 检查chunk大小是否合理
      if (chunkSize > buffer.length - pos - 8) {
        console.warn(`Chunk ${chunkType} size ${chunkSize} exceeds buffer bounds`);
        break;
      }

      chunks.push({
        type: chunkType,
        size: chunkSize,
        offset: pos,
        data: buffer.slice(pos + 8, pos + 8 + chunkSize)
      });

      pos += 8 + chunkSize;

      // 如果是奇数大小，需要padding字节
      if (chunkSize % 2 === 1) {
        pos += 1;
      }
    }

    // 查找是否已存在EXIF chunk
    const exifIndex = chunks.findIndex(chunk => chunk.type === 'EXIF');

    if (exifIndex !== -1) {
      // 替换现有的EXIF chunk
      chunks[exifIndex].data = exifData;
      chunks[exifIndex].size = exifData.length;
    } else {
      // 在VP8X之后插入新的EXIF chunk
      const vp8xIndex = chunks.findIndex(chunk => chunk.type === 'VP8X');
      const insertIndex = vp8xIndex !== -1 ? vp8xIndex + 1 : 0;

      chunks.splice(insertIndex, 0, {
        type: 'EXIF',
        size: exifData.length,
        offset: 0, // 将在后面计算
        data: exifData
      });

      // 如果有VP8X，更新其标志位
      if (vp8xIndex !== -1) {
        const vp8xData = chunks[vp8xIndex].data;
        if (vp8xData.length >= 1) {
          const newVp8xData = Buffer.alloc(vp8xData.length);
          vp8xData.copy(newVp8xData);
          newVp8xData[0] = vp8xData[0] | 0x08; // 设置EXIF标志位
          chunks[vp8xIndex].data = newVp8xData;
        }
      }
    }

    // 计算总大小
    let totalSize = 4; // 'WEBP'大小
    chunks.forEach(chunk => {
      totalSize += 8 + chunk.size;
      if (chunk.size % 2 === 1) {
        totalSize += 1; // padding
      }
    });

    // 创建新的buffer
    const newBuffer = Buffer.alloc(12 + totalSize);

    // 写入RIFF头
    newBuffer.write('RIFF', 0);
    newBuffer.writeUInt32LE(totalSize, 4);
    newBuffer.write('WEBP', 8);

    // 写入所有chunks
    let writePos = 12;
    chunks.forEach(chunk => {
      newBuffer.write(chunk.type, writePos);
      newBuffer.writeUInt32LE(chunk.size, writePos + 4);
      chunk.data.copy(newBuffer, writePos + 8);

      writePos += 8 + chunk.size;

      // 添加padding字节（如果chunk大小是奇数）
      if (chunk.size % 2 === 1) {
        newBuffer[writePos] = 0;
        writePos += 1;
      }
    });

    return newBuffer;
  }
}

export default WEBP