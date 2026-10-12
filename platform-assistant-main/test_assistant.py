import asyncio
import sys
import time
import os
from pathlib import Path
from dotenv import load_dotenv

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

# Always reload .env freshly
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(dotenv_path=BASE_DIR / ".env", override=True)

import backend.config as cfg
import importlib
importlib.reload(cfg)

from backend.rag_engine import rag_engine
from backend.llm_client import LLMClient

def mask_key(key: str) -> str:
    if not key or key in ["your_groq_api_key_here", "your_api_key_here", "your_grok_api_key_here"]:
        return "❌ NOT CONFIGURED (Placeholder detected in .env)"
    if len(key) <= 8:
        return key[:2] + "****"
    return key[:4] + "****" + key[-4:]

async def run_diagnostics():
    print("=" * 60)
    print("🤖 CareOS Platform Assistant - Model & RAG Diagnostic Test")
    print("=" * 60)

    # 1. Configuration Check
    client = LLMClient()
    print("\n[1] Environment & Model Configuration:")
    print(f" • Model Name : {client.model}")
    print(f" • Base URL   : {client.base_url}")
    print(f" • API Key    : {mask_key(client.api_key)}")
    print(f" • Configured : {'✅ YES' if client.is_configured() else '⚠️ NO (Running in fallback mode)'}")

    # 2. RAG Knowledge Base Check
    print("\n[2] Testing RAG Knowledge Base Retrieval:")
    print(f" • Total indexed chunks: {len(rag_engine.chunks)}")

    test_queries = [
        ("English Query", "What services does CareOS provide to patients?"),
        ("Arabic Query", "ما هي الخدمات والمعلومات التي توفرها المنصة للمرضى؟"),
        ("Sign-In Navigation", "ازاي اسجل دخول في المنصة؟")
    ]

    for label, query in test_queries:
        chunks = rag_engine.retrieve(query, top_k=2)
        top_title = chunks[0].get('title', 'None') if chunks else 'None'
        category = chunks[0].get('category', 'None') if chunks else 'None'
        print(f" • {label}: Matched '{top_title}' [{category}]")

    # 3. Model Live Inference Test
    print("\n[3] Testing Model Inference with Groq:")
    if not client.is_configured():
        print(" ⚠️ Notice: Your Groq API key is still the placeholder in `.env`.")
        print("    To test the live Groq model:")
        print("    1. Open `.env`")
        print("    2. Set `GROQ_API_KEY=gsk_your_actual_key_here`")
        print("    3. Save the file and run `py test_assistant.py` again.\n")
        print(" • Testing Fallback Mode Response (When API key is absent):")
        start_time = time.time()
        fallback_resp = await client.generate_response([{"role": "user", "content": "ما هي منصة كير أو إس؟"}])
        duration = time.time() - start_time
        print(f" • Latency: {duration:.2f}s")
        print(f" • Sample Output:\n{fallback_resp[:250]}...\n")
    else:
        test_prompt = "Explain in 2 concise sentences what CareOS is and why doctors love it."
        print(f" • Sending test query to model `{client.model}` on Groq...")
        start_time = time.time()
        try:
            response = await client.generate_response([{"role": "user", "content": test_prompt}])
            duration = time.time() - start_time
            print(f" • Response received in {duration:.2f} seconds! 🚀")
            
            if response.startswith("⚠️"):
                print(f"\n❌ Model Issue Encountered:\n{response}")
            else:
                print(f"\n✅ Model Output ({client.model}):\n{response}\n")
                
                # Bilingual Arabic test
                print(" • Testing Arabic generation quality...")
                ar_prompt = "اشرح باختصار شديد في جملتين كيف يساعد CareOS الأطباء."
                ar_resp = await client.generate_response([{"role": "user", "content": ar_prompt}])
                print(f"\n✅ Arabic Model Output:\n{ar_resp}\n")
                print("=" * 60)
                print("🎉 Model is working perfectly with Groq and ready for production!")
                print("=" * 60)
        except Exception as e:
            print(f"❌ Unexpected Error: {str(e)}")

if __name__ == "__main__":
    asyncio.run(run_diagnostics())
