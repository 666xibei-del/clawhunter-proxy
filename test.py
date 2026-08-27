#!/usr/bin/env python3
"""
Claw Hunter API 代理測試腳本
測試 OpenAI 相容的圖片生成 API

使用方法:
    python3 test.py --url https://your-worker.workers.dev --key sk-claw-xxx
    python3 test.py --url https://your-worker.workers.dev --key sk-claw-xxx --model gpt-image-2
"""

import argparse
import json
import base64
import os
import time
import requests

def test_health(base_url):
    """測試健康檢查"""
    print("❤️  健康檢查...")
    r = requests.get(f"{base_url}/health", timeout=10)
    data = r.json()
    print(f"   狀態: {data.get('status')}")
    return r.status_code == 200

def test_models(base_url, api_key):
    """測試模型列表"""
    print("\n📋 獲取模型列表...")
    r = requests.get(f"{base_url}/v1/models", 
                    headers={"Authorization": f"Bearer {api_key}"},
                    timeout=10)
    data = r.json()
    models = data.get("data", [])
    print(f"   可用模型: {len(models)} 個")
    for m in models[:5]:
        price = m.get("pricing", {}).get("image", 0)
        print(f"   - {m['id']:20s} ${price}/張")
    if len(models) > 5:
        print(f"   ... 還有 {len(models)-5} 個")
    return len(models) > 0

def test_generate(base_url, api_key, model="z-image-turbo", prompt="A cute cat", output_dir="./output"):
    """測試圖片生成"""
    print(f"\n🎨 生成圖片...")
    print(f"   模型: {model}")
    print(f"   提示詞: {prompt}")
    
    start = time.time()
    
    r = requests.post(f"{base_url}/v1/images/generations",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        },
        json={
            "model": model,
            "prompt": prompt,
            "n": 1,
            "size": "1024x1024",
            "quality": "standard"
        },
        timeout=60)
    
    elapsed = time.time() - start
    data = r.json()
    
    if r.status_code != 200:
        print(f"   ❌ HTTP {r.status_code}: {data.get('error', {}).get('message', 'Unknown error')}")
        return False
    
    images = data.get("data", [])
    if not images:
        print(f"   ❌ 未返回圖片")
        return False
    
    # 保存圖片
    os.makedirs(output_dir, exist_ok=True)
    
    for i, img in enumerate(images):
        url = img.get("url", "")
        if url.startswith("data:image/"):
            # Base64
            header, b64data = url.split(",", 1)
            ext = "png" if "png" in header else "jpg"
            img_bytes = base64.b64decode(b64data)
        elif url.startswith("http"):
            # URL
            img_r = requests.get(url, timeout=30)
            img_bytes = img_r.content
            ext = "png"
        else:
            continue
        
        filename = f"{model}_{i+1}.{ext}"
        filepath = os.path.join(output_dir, filename)
        with open(filepath, "wb") as f:
            f.write(img_bytes)
        
        size_kb = len(img_bytes) / 1024
        print(f"   ✅ 成功! {elapsed:.1f}s {size_kb:.0f}KB")
        print(f"   💾 保存: {filepath}")
    
    # 打印響應頭
    claw_model = r.headers.get("X-Claw-Model", "")
    claw_cost = r.headers.get("X-Claw-Cost", "")
    claw_note = r.headers.get("X-Claw-Note", "")
    
    if claw_model:
        print(f"   📊 實際模型: {claw_model}")
    if claw_cost:
        print(f"   💰 費用: ${claw_cost}")
    if claw_note:
        print(f"   📝 {claw_note}")
    
    return True

def main():
    parser = argparse.ArgumentParser(description="Claw Hunter API 代理測試")
    parser.add_argument("--url", "-u", required=True, help="Worker URL")
    parser.add_argument("--key", "-k", required=True, help="API Key")
    parser.add_argument("--model", "-m", default="z-image-turbo", help="模型 ID")
    parser.add_argument("--prompt", "-p", default="A cute orange cat sitting on a windowsill, watercolor style", help="提示詞")
    parser.add_argument("--output", "-o", default="./output", help="輸出目錄")
    parser.add_argument("--all-models", action="store_true", help="測試所有模型")
    
    args = parser.parse_args()
    
    base_url = args.url.rstrip("/")
    
    print("=" * 60)
    print("🐾 Claw Hunter API 代理測試")
    print("=" * 60)
    print(f"URL: {base_url}")
    
    # 健康檢查
    if not test_health(base_url):
        print("❌ 健康檢查失敗")
        return
    
    # 模型列表
    test_models(base_url, args.key)
    
    if args.all_models:
        # 測試所有模型
        models = ["z-image-turbo", "nano-banana-2", "gpt-image-2", 
                  "flux-2-pro", "seedream-4-5", "grok-imagine"]
        for model in models:
            print(f"\n{'─' * 40}")
            test_generate(base_url, args.key, model, args.prompt, args.output)
            time.sleep(2)
    else:
        # 測試單個模型
        test_generate(base_url, args.key, args.model, args.prompt, args.output)
    
    print("\n" + "=" * 60)
    print("✅ 測試完成!")
    print("=" * 60)

if __name__ == "__main__":
    main()
