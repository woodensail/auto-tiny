import fs from 'fs'
import _ from 'lodash'
import tinify from 'tinify'
import {glob} from 'glob'
import {program} from "commander";
import PNG from "./png.js";
import WEBP from "./webp.js";

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
    let ImgAction
    if (path.endsWith('.png')) {
      ImgAction = PNG
    }else if(path.endsWith('.webp')) {
      ImgAction = WEBP
    } else {
      skipCount++
      log('跳过处理', path)
      srcList.shift()
      continue
    }

    // 读取图片
    const file = await fs.readFileSync(path);
    // 如果有已处理标记则跳过
    const hasWatermark = ImgAction.checkWaterMark(file, watermark)
    if (hasWatermark) {
      skipCount++
      log('跳过处理', path)
      srcList.shift()
      continue
    }
    try {
      const newBuffer = ImgAction.insertWaterMark(await tinify.fromBuffer(file).toBuffer(), watermark)
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