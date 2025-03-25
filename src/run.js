import fs from 'fs'
import _ from 'lodash'
import crc from 'crc'
import tinify from 'tinify'
import {glob} from 'glob'
import {program} from "commander";

const options = program.opts();
function log(){
  if(options.log){
    console.log(...arguments)
  }
}

export default async function run() {
  // 将key数组乱序，以尽量均衡使用
  const config = loadConfig()
  const watermark = config.watermark || 'tiny'
  const keys = _.shuffle(config.keys);
  const srcList = []
  // 寻找所有待压缩图片
  for (let i = 0; i < config.imgPatterns.length; i++) {
    const list = await glob(config.imgPatterns[i])
    srcList.push(...list)
  }

  // 循环处理，直到所有图片处理完毕，或可用key耗尽
  const totalImg = srcList.length
  const totalKey = keys.length
  let proceedCount = 0
  let skipCount = 0
  let errCount = 0
  while (srcList.length && keys.length) {
    log(`图片[${totalImg-srcList.length+1}/${totalImg}], key[${totalKey-keys.length+1}/${totalKey}]`)
    // 获取图片
    const path = srcList[0]
    // 获取key
    tinify.key = keys[0]

    // 读取图片
    const file = await fs.readFileSync(path);
    // 如果有已处理标记则跳过
    const hasWatermark = findWatermark(file, watermark)
    if (hasWatermark) {
      skipCount++
      log('跳过处理', path)
      srcList.shift()
      continue
    }
    try {
      const newBuffer = insertTextChunkIntoPng(await tinify.fromBuffer(file).toBuffer(), watermark)
      await fs.writeFileSync(path, newBuffer)
    } catch (err) {
      if (err instanceof tinify.AccountError) {
        // Verify your API key and account limit.
        log('key失效或达到限额:', keys[0])
        keys.shift()
        continue
      } else if (err instanceof tinify.ClientError) {
        log('图片文件异常，已跳过', path)
        errCount++
        srcList.shift()
        continue
      } else if (err instanceof tinify.ServerError) {
        log('服务器异常，结束处理')
        break
      } else if (err instanceof tinify.ConnectionError) {
        log('网络连接异常，结束处理')
        break
      } else {
        console.error(err)
        break
      }
    }
    proceedCount++
    log('完成处理', path)
    srcList.shift()
  }
  log(`处理完毕，共扫描到${totalImg}张图片，已压缩${proceedCount}张，已跳过${skipCount}张，处理失败${errCount}张，剩余${srcList.length}张`)
}

function findWatermark(buffer, text) {
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
}

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

function insertTextChunkIntoPng(buffer, text) {

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


function loadConfig() {
  try {
    const configStr = fs.readFileSync('./.autotinyrc.json', 'utf8');
    return JSON.parse(configStr);
  } catch (e) {
    console.error('解析配置文件失败，请创建并配置.autotinyrc.json文件')
    return null;
  }
  return config;
}