"""
开发服务器 - 用于本地开发调试
端口: 5002 (避免与 web.py 的 5001 端口冲突)
"""
from flask import Flask, send_from_directory, send_file
import os

app = Flask(__name__)

# 获取当前目录
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

@app.route('/')
def index():
    """返回主页"""
    return send_file(os.path.join(BASE_DIR, 'index.html'))

@app.route('/<path:path>')
def serve_static(path):
    """静态文件服务"""
    return send_from_directory(BASE_DIR, path)

if __name__ == '__main__':
    print("=" * 50)
    print("开发服务器启动")
    print("地址: http://localhost:5002")
    print("=" * 50)
    app.run(host='0.0.0.0', port=5002, debug=True)
