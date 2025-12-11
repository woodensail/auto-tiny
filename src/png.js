import crc from "crc";

function createTextChunk(text) {
  const data = Buffer.from(text, 'utf-8');
  const length = data.length;
  const type = Buffer.from('tEXt', 'ascii');
  const crc = calculateCRC(Buffer.concat([type, data]));

  const chunk = Buffer.alloc(4 + 4 + data.length + 4);
  chunk.writeUInt32BE(length, 0);
  type.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc, 8 + data.length);

  return chunk;
}

function calculateCRC(buffer) {
  // 使用crc模块计算CRC32
  return crc.crc32(buffer);
}

const PNG = {
  checkWaterMark(buffer, text) {
    // 检查PNG文件签名
    const pngSignature = buffer.slice(0, 8);
    if (!pngSignature.equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) {
      throw new Error('Invalid PNG file signature');
    }

    let offset = 8; // 跳过PNG文件签名
    while (offset < buffer.length) {
      // 解析chunk长度
      const length = buffer.readUInt32BE(offset);
      offset += 4;

      // 解析chunk类型
      const type = buffer.slice(offset, offset + 4).toString();
      offset += 4;

      // 解析chunk数据
      const data = buffer.slice(offset, offset + length);
      offset += length;

      // 解析CRC校验码
      const crc = buffer.readUInt32BE(offset);
      offset += 4;

      if (type === 'tEXt' && data.toString() === text) {
        return true
      }

      // 如果是IEND类型chunk，结束解析
      if (type === 'IEND') {
        break;
      }
    }
  },
  insertWaterMark(buffer, text) {

    // 检查PNG文件签名
    const pngSignature = buffer.slice(0, 8);
    if (!pngSignature.equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) {
      throw new Error('Invalid PNG file signature');
    }

    let offset = 8; // 跳过PNG文件签名
    let iendOffset = -1;

    // 找到IEND块的位置
    while (offset < buffer.length) {
      const length = buffer.readUInt32BE(offset);
      const type = buffer.slice(offset + 4, offset + 8).toString();
      if (type === 'IEND') {
        iendOffset = offset;
        break;
      }
      offset += 12 + length; // 跳过当前chunk
    }

    if (iendOffset === -1) {
      throw new Error('IEND chunk not found');
    }

    // 创建新的tEXt块
    const textChunk = createTextChunk(text);

    // 构建新的PNG文件内容
    return Buffer.concat([
      buffer.slice(0, iendOffset),
      textChunk,
      buffer.slice(iendOffset)
    ]);
  }
}

export default PNG