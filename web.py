from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import os

app = Flask(__name__)
CORS(app)  # 允许跨域请求

# 数据存储目录
DATA_DIR = 'data'
SCHEMA_DIR = 'schema'

# 确保目录存在
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(SCHEMA_DIR, exist_ok=True)


def get_schema_path(name):
    """获取schema文件路径"""
    return os.path.join(SCHEMA_DIR, f'{name}.json')


def get_data_path(name):
    """获取数据文件路径"""
    return os.path.join(DATA_DIR, f'{name}.json')


def read_json_file(filepath):
    """读取JSON文件"""
    try:
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
        return None
    except Exception as e:
        print(f"读取文件错误 {filepath}: {e}")
        return None


def write_json_file(filepath, data):
    """写入JSON文件"""
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"写入文件错误 {filepath}: {e}")
        return False


def list_schemas():
    """列出所有schema"""
    schemas = []
    try:
        for filename in os.listdir(SCHEMA_DIR):
            if filename.endswith('.json'):
                schema_name = filename[:-5]
                schema_data = read_json_file(get_schema_path(schema_name))
                if schema_data:
                    schemas.append(schema_data)
    except Exception as e:
        print(f"列出schema错误: {e}")
    return schemas


@app.route('/api/schema', methods=['GET', 'POST'])
def schema_handler():
    """Schema API接口 - 处理schema的增删改查"""
    
    if request.method == 'GET':
        # 查询操作
        action = request.args.get('action', 'list')
        
        if action == 'list':
            # 列出所有schema
            schemas = list_schemas()
            return jsonify({
                'success': True,
                'data': schemas
            })
        
        elif action == 'get':
            # 获取单个schema
            name = request.args.get('name')
            if not name:
                return jsonify({
                    'success': False,
                    'error': '缺少schema名称'
                }), 400
            
            schema_data = read_json_file(get_schema_path(name))
            if schema_data is None:
                return jsonify({
                    'success': False,
                    'error': f'Schema "{name}" 不存在'
                }), 404
            
            return jsonify({
                'success': True,
                'data': schema_data
            })
    
    elif request.method == 'POST':
        # 修改操作
        try:
            data = request.get_json()
            action = data.get('action')
            name = data.get('name')
            
            if not action or not name:
                return jsonify({
                    'success': False,
                    'error': '缺少必要参数'
                }), 400
            
            if action == 'create':
                # 创建schema
                schema_path = get_schema_path(name)
                
                # 检查是否已存在
                if os.path.exists(schema_path):
                    return jsonify({
                        'success': False,
                        'error': f'Schema "{name}" 已存在'
                    }), 400
                
                schema_data = data.get('data', {})
                if write_json_file(schema_path, schema_data):
                    # 同时创建空的数据文件
                    write_json_file(get_data_path(name), [])
                    
                    return jsonify({
                        'success': True,
                        'message': 'Schema创建成功'
                    })
                else:
                    return jsonify({
                        'success': False,
                        'error': '保存Schema失败'
                    }), 500
            
            elif action == 'update':
                # 更新schema
                schema_path = get_schema_path(name)
                
                # 检查是否存在
                if not os.path.exists(schema_path):
                    return jsonify({
                        'success': False,
                        'error': f'Schema "{name}" 不存在'
                    }), 404
                
                schema_data = data.get('data', {})
                if write_json_file(schema_path, schema_data):
                    return jsonify({
                        'success': True,
                        'message': 'Schema更新成功'
                    })
                else:
                    return jsonify({
                        'success': False,
                        'error': '保存Schema失败'
                    }), 500
            
            elif action == 'delete':
                # 删除schema
                schema_path = get_schema_path(name)
                data_path = get_data_path(name)
                
                try:
                    # 删除schema文件
                    if os.path.exists(schema_path):
                        os.remove(schema_path)
                    
                    # 删除对应的数据文件
                    if os.path.exists(data_path):
                        os.remove(data_path)
                    
                    return jsonify({
                        'success': True,
                        'message': 'Schema删除成功'
                    })
                except Exception as e:
                    return jsonify({
                        'success': False,
                        'error': f'删除Schema失败: {str(e)}'
                    }), 500
            
            else:
                return jsonify({
                    'success': False,
                    'error': f'不支持的操作: {action}'
                }), 400
        
        except Exception as e:
            return jsonify({
                'success': False,
                'error': f'处理请求失败: {str(e)}'
            }), 500


@app.route('/api/data', methods=['GET', 'POST'])
def data_handler():
    """Data API接口 - 处理配表数据的增删改查"""
    
    if request.method == 'GET':
        # 查询操作
        action = request.args.get('action', 'get')
        name = request.args.get('name')
        
        if not name:
            return jsonify({
                'success': False,
                'error': '缺少schema名称'
            }), 400
        
        # 检查schema是否存在
        schema_path = get_schema_path(name)
        if not os.path.exists(schema_path):
            return jsonify({
                'success': False,
                'error': f'Schema "{name}" 不存在'
            }), 404
        
        # 读取数据
        data_path = get_data_path(name)
        data = read_json_file(data_path)
        
        # 如果数据文件不存在，返回空数组
        if data is None:
            data = []
            write_json_file(data_path, data)
        
        return jsonify({
            'success': True,
            'data': data
        })
    
    elif request.method == 'POST':
        # 修改操作
        try:
            req_data = request.get_json()
            action = req_data.get('action')
            name = req_data.get('name')
            
            if not action or not name:
                return jsonify({
                    'success': False,
                    'error': '缺少必要参数'
                }), 400
            
            # 检查schema是否存在
            schema_path = get_schema_path(name)
            if not os.path.exists(schema_path):
                return jsonify({
                    'success': False,
                    'error': f'Schema "{name}" 不存在'
                }), 404
            
            data_path = get_data_path(name)
            
            if action == 'update':
                # 更新数据
                data = req_data.get('data', [])
                
                if write_json_file(data_path, data):
                    return jsonify({
                        'success': True,
                        'message': '数据保存成功'
                    })
                else:
                    return jsonify({
                        'success': False,
                        'error': '保存数据失败'
                    }), 500
            
            else:
                return jsonify({
                    'success': False,
                    'error': f'不支持的操作: {action}'
                }), 400
        
        except Exception as e:
            return jsonify({
                'success': False,
                'error': f'处理请求失败: {str(e)}'
            }), 500


@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查接口"""
    return jsonify({
        'success': True,
        'message': '服务运行正常'
    })


if __name__ == '__main__':
    print('配表系统后端服务启动中...')
    print('服务地址: http://localhost:5000')
    print('Schema API: http://localhost:5000/api/schema')
    print('Data API: http://localhost:5000/api/data')
    print('按 Ctrl+C 停止服务')
    app.run(host='0.0.0.0', port=5000, debug=True)
