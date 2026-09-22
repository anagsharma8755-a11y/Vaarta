import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { DEFAULT_ASR_FUNCTION, DEFAULT_CHAT_MODEL, DEFAULT_QUESTION_MODEL } from './nvidia.js'

export function readConfig() {
  let local = {}
  try { local = parseEnv(readFileSync(new URL('./.env', import.meta.url), 'utf8')) } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const value = (name, fallback = '') => (process.env[name] || local[name] || fallback).trim()
  return {
    apiKey: value('NVIDIA_API_KEY'),
    speechKey: value('ELEVENLABS_API_KEY'),
    voiceId: value('ELEVENLABS_VOICE_ID', 'JBFqnCBsd6RMkjVDRZzb'),
    model: value('NVIDIA_CHAT_MODEL', DEFAULT_CHAT_MODEL),
    questionModel: value('NVIDIA_QUESTION_MODEL', DEFAULT_QUESTION_MODEL),
    functionId: value('NVIDIA_ASR_FUNCTION_ID', DEFAULT_ASR_FUNCTION),
    port: Number(value('PORT', '4000')),
  }
}
