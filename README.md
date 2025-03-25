# 公证处项目-前端

## 安装

```shell
npm install auto-tiny -g
```

## 配置文件
请在项目根目录下创建 .autotinyrc.json 文件，配置如下

| 字段          | 作用                    |
|-------------|-----------------------|
| keys        | tinyPng 的 apiKey      |
| imgPatterns | 需要压缩的图片路径，配置方式参考 glob |
| watermark   | 水印字符串，用于防止重复压缩        |

```json
{
  "keys": [
    "***"
  ],
  "imgPatterns": [
    "./public/*"
  ],
  "watermark": "tiny"
}
```

## 运行
```shell
auto-tiny
```