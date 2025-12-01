from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import os

app = Flask(__name__)
CORS(app)  # 允许跨域请求

# 项目根目录（包含所有项目文件夹）
PROJECTS_ROOT = 'projects'

# 默认项目名（兼容旧结构）
DEFAULT_PROJECT = 'default'

# 确保项目根目录存在
os.makedirs(PROJECTS_ROOT, exist_ok=True)


def get_project_path(project=None):
    """获取项目目录路径"""
    if not project:
        project = DEFAULT_PROJECT
    return os.path.join(PROJECTS_ROOT, project)


def get_project_dirs(project=None):
    """获取项目的子目录路径"""
    project_path = get_project_path(project)
    return {
        'data': os.path.join(project_path, 'data'),
        'schema': os.path.join(project_path, 'schema'),
        'enum': os.path.join(project_path, 'enum')
    }


def ensure_project_dirs(project=None):
    """确保项目目录存在"""
    dirs = get_project_dirs(project)
    for dir_path in dirs.values():
        os.makedirs(dir_path, exist_ok=True)


# 兼容旧结构：迁移旧数据到默认项目
def migrate_old_structure():
    """将旧的 data/schema/enum 目录迁移到 projects/default/"""
    old_dirs = ['data', 'schema', 'enum']
    default_project_path = get_project_path(DEFAULT_PROJECT)
    
    for old_dir in old_dirs:
        if os.path.exists(old_dir) and os.path.isdir(old_dir):
            new_dir = os.path.join(default_project_path, old_dir)
            if not os.path.exists(new_dir):
                os.makedirs(new_dir, exist_ok=True)
            # 移动文件
            for filename in os.listdir(old_dir):
                old_path = os.path.join(old_dir, filename)
                new_path = os.path.join(new_dir, filename)
                if os.path.isfile(old_path) and not os.path.exists(new_path):
                    import shutil
                    shutil.copy2(old_path, new_path)
                    print(f'迁移文件: {old_path} -> {new_path}')


# 初始化：确保默认项目存在
ensure_project_dirs(DEFAULT_PROJECT)

# Lua ValueType 缓存
lua_value_types = []


def parse_enum_lua():
    """解析 enum.lua 文件，提取 ValueType"""
    global lua_value_types
    lua_value_types = []
    
    enum_lua_path = 'enum.lua'
    abs_path = os.path.abspath(enum_lua_path)
    print(f'尝试读取文件: {abs_path}')
    print(f'文件是否存在: {os.path.exists(enum_lua_path)}')
    
    if not os.path.exists(enum_lua_path):
        print(f'警告: {enum_lua_path} 文件不存在')
        return
    
    try:
        # 检查文件大小
        file_size = os.path.getsize(enum_lua_path)
        print(f'文件大小: {file_size} 字节')
        
        with open(enum_lua_path, 'r', encoding='utf-8') as f:
            content = f.read()
            lines = content.splitlines()
        
        print(f'读取到 {len(lines)} 行')
        
        import re
        in_value_type = False
        line_count = 0
        match_count = 0
        
        for idx, line in enumerate(lines, 1):
            # 打印前5行用于调试
            if idx <= 5:
                print(f'行 {idx}: {repr(line[:60])}')
            
            # 寻找 "Enums.ValueType = {" 这一行开始
            if 'Enums.ValueType' in line and '=' in line and '{' in line:
                in_value_type = True
                print(f'找到 Enums.ValueType 开始标记 (行 {idx})')
                continue
            
            if in_value_type and '}' in line:
                print(f'找到结束标记，共处理 {line_count} 行，匹配 {match_count} 个类型')
                break
            
            if in_value_type:
                line_count += 1
                # 匹配格式: \tTypeName = 'TypeName',  ---描述
                # 注意: 使用\t或\s+匹配缩进，逗号后有两个空格
                match = re.match(r'[\s\t]*(\w+)\s*=\s*[\'"](\w+)[\'"]\s*,\s*---(.+)', line)
                if match:
                    match_count += 1
                    type_name = match.group(1)
                    description = match.group(3).strip()
                    lua_value_types.append({
                        'value': type_name,
                        'label': description
                    })
                    if match_count <= 3:  # 只打印前3个
                        print(f'  匹配: {type_name} -> {description}')
                else:
                    # 调试：打印未匹配的行（前3行）
                    if line_count <= 3 and line.strip():
                        print(f'  未匹配行 {line_count}: {repr(line[:50])}')
        
        print(f'已解析 enum.lua，提取 {len(lua_value_types)} 个 ValueType')
        if len(lua_value_types) == 0:
            print('警告: 未能从 enum.lua 提取任何 ValueType，请检查文件格式')
    except Exception as e:
        print(f'解析 enum.lua 失败: {e}')


def get_schema_path(name, project=None):
    """获取schema文件路径"""
    dirs = get_project_dirs(project)
    return os.path.join(dirs['schema'], f'{name}.json')


def get_data_path(name, project=None):
    """获取数据文件路径"""
    dirs = get_project_dirs(project)
    return os.path.join(dirs['data'], f'{name}.json')


def get_enum_path(name, project=None):
    """获取枚举文件路径"""
    dirs = get_project_dirs(project)
    return os.path.join(dirs['enum'], f'{name}.json')


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


def list_schemas(project=None):
    """列出所有schema"""
    schemas = []
    dirs = get_project_dirs(project)
    schema_dir = dirs['schema']
    try:
        if not os.path.exists(schema_dir):
            return schemas
        for filename in os.listdir(schema_dir):
            if filename.endswith('.json'):
                schema_name = filename[:-5]
                schema_data = read_json_file(get_schema_path(schema_name, project))
                if schema_data:
                    schemas.append(schema_data)
    except Exception as e:
        print(f"列出schema错误: {e}")
    return schemas


def list_enums(project=None):
    """列出所有枚举"""
    enums = []
    dirs = get_project_dirs(project)
    enum_dir = dirs['enum']
    try:
        if not os.path.exists(enum_dir):
            return enums
        for filename in os.listdir(enum_dir):
            if filename.endswith('.json'):
                enum_name = filename[:-5]
                enum_data = read_json_file(get_enum_path(enum_name, project))
                if enum_data:
                    enums.append(enum_data)
    except Exception as e:
        print(f"列出枚举错误: {e}")
    return enums


# ==================== 项目管理 API ====================

@app.route('/api/projects', methods=['GET', 'POST'])
def projects_handler():
    """项目管理API - 列出、创建、删除项目"""
    
    if request.method == 'GET':
        # 列出所有项目
        projects = []
        try:
            if os.path.exists(PROJECTS_ROOT):
                for name in os.listdir(PROJECTS_ROOT):
                    project_path = os.path.join(PROJECTS_ROOT, name)
                    if os.path.isdir(project_path):
                        # 获取项目统计信息
                        dirs = get_project_dirs(name)
                        schema_count = 0
                        enum_count = 0
                        if os.path.exists(dirs['schema']):
                            schema_count = len([f for f in os.listdir(dirs['schema']) if f.endswith('.json')])
                        if os.path.exists(dirs['enum']):
                            enum_count = len([f for f in os.listdir(dirs['enum']) if f.endswith('.json')])
                        
                        projects.append({
                            'name': name,
                            'schemaCount': schema_count,
                            'enumCount': enum_count
                        })
        except Exception as e:
            print(f"列出项目错误: {e}")
        
        return jsonify({
            'success': True,
            'data': projects
        })
    
    elif request.method == 'POST':
        try:
            data = request.get_json()
            action = data.get('action')
            name = data.get('name')
            
            if not action or not name:
                return jsonify({
                    'success': False,
                    'error': '缺少必要参数'
                }), 400
            
            # 验证项目名称（只允许字母、数字、下划线、中划线）
            import re
            if not re.match(r'^[\w\-]+$', name):
                return jsonify({
                    'success': False,
                    'error': '项目名称只能包含字母、数字、下划线和中划线'
                }), 400
            
            if action == 'create':
                project_path = get_project_path(name)
                
                if os.path.exists(project_path):
                    return jsonify({
                        'success': False,
                        'error': f'项目 "{name}" 已存在'
                    }), 400
                
                ensure_project_dirs(name)
                return jsonify({
                    'success': True,
                    'message': f'项目 "{name}" 创建成功'
                })
            
            elif action == 'delete':
                if name == DEFAULT_PROJECT:
                    return jsonify({
                        'success': False,
                        'error': '不能删除默认项目'
                    }), 400
                
                project_path = get_project_path(name)
                
                if not os.path.exists(project_path):
                    return jsonify({
                        'success': False,
                        'error': f'项目 "{name}" 不存在'
                    }), 404
                
                import shutil
                shutil.rmtree(project_path)
                return jsonify({
                    'success': True,
                    'message': f'项目 "{name}" 已删除'
                })
            
            elif action == 'rename':
                new_name = data.get('newName')
                if not new_name:
                    return jsonify({
                        'success': False,
                        'error': '缺少新名称'
                    }), 400
                
                if not re.match(r'^[\w\-]+$', new_name):
                    return jsonify({
                        'success': False,
                        'error': '项目名称只能包含字母、数字、下划线和中划线'
                    }), 400
                
                old_path = get_project_path(name)
                new_path = get_project_path(new_name)
                
                if not os.path.exists(old_path):
                    return jsonify({
                        'success': False,
                        'error': f'项目 "{name}" 不存在'
                    }), 404
                
                if os.path.exists(new_path):
                    return jsonify({
                        'success': False,
                        'error': f'项目 "{new_name}" 已存在'
                    }), 400
                
                os.rename(old_path, new_path)
                return jsonify({
                    'success': True,
                    'message': f'项目已重命名为 "{new_name}"'
                })
            
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


@app.route('/api/schema', methods=['GET', 'POST'])
def schema_handler():
    """Schema API接口 - 处理schema的增删改查"""
    
    # 获取项目参数
    project = request.args.get('project') or (request.get_json() or {}).get('project')
    
    if request.method == 'GET':
        # 查询操作
        action = request.args.get('action', 'list')
        
        if action == 'list':
            # 列出所有schema
            schemas = list_schemas(project)
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
            
            schema_data = read_json_file(get_schema_path(name, project))
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
                ensure_project_dirs(project)
                schema_path = get_schema_path(name, project)
                
                # 检查是否已存在
                if os.path.exists(schema_path):
                    return jsonify({
                        'success': False,
                        'error': f'Schema "{name}" 已存在'
                    }), 400
                
                schema_data = data.get('data', {})
                if write_json_file(schema_path, schema_data):
                    # 同时创建空的数据文件
                    write_json_file(get_data_path(name, project), [])
                    
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
                schema_path = get_schema_path(name, project)
                
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
                schema_path = get_schema_path(name, project)
                data_path = get_data_path(name, project)
                
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
    
    # 获取项目参数
    project = request.args.get('project') or (request.get_json() or {}).get('project')
    
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
        schema_path = get_schema_path(name, project)
        if not os.path.exists(schema_path):
            return jsonify({
                'success': False,
                'error': f'Schema "{name}" 不存在'
            }), 404
        
        # 读取数据
        data_path = get_data_path(name, project)
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
            project = req_data.get('project', project)
            
            if not action or not name:
                return jsonify({
                    'success': False,
                    'error': '缺少必要参数'
                }), 400
            
            # 检查schema是否存在
            schema_path = get_schema_path(name, project)
            if not os.path.exists(schema_path):
                return jsonify({
                    'success': False,
                    'error': f'Schema "{name}" 不存在'
                }), 404
            
            data_path = get_data_path(name, project)
            
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


@app.route('/api/enum', methods=['GET', 'POST'])
def enum_handler():
    """Enum API接口 - 处理枚举的增删改查"""
    
    # 获取项目参数
    project = request.args.get('project') or (request.get_json() or {}).get('project')
    
    if request.method == 'GET':
        # 查询操作
        action = request.args.get('action', 'list')
        
        if action == 'list':
            # 列出所有枚举
            enums = list_enums(project)
            return jsonify({
                'success': True,
                'data': enums
            })
        
        elif action == 'get':
            # 获取单个枚举
            name = request.args.get('name')
            if not name:
                return jsonify({
                    'success': False,
                    'error': '缺少枚举名称'
                }), 400
            
            enum_data = read_json_file(get_enum_path(name, project))
            if enum_data is None:
                return jsonify({
                    'success': False,
                    'error': f'枚举 "{name}" 不存在'
                }), 404
            
            return jsonify({
                'success': True,
                'data': enum_data
            })
    
    elif request.method == 'POST':
        # 修改操作
        try:
            data = request.get_json()
            action = data.get('action')
            name = data.get('name')
            project = data.get('project', project)
            
            if not action or not name:
                return jsonify({
                    'success': False,
                    'error': '缺少必要参数'
                }), 400
            
            if action == 'create':
                # 创建枚举
                ensure_project_dirs(project)
                enum_path = get_enum_path(name, project)
                
                # 检查是否已存在
                if os.path.exists(enum_path):
                    return jsonify({
                        'success': False,
                        'error': f'枚举 "{name}" 已存在'
                    }), 400
                
                enum_data = data.get('data', {})
                if write_json_file(enum_path, enum_data):
                    return jsonify({
                        'success': True,
                        'message': '枚举创建成功'
                    })
                else:
                    return jsonify({
                        'success': False,
                        'error': '保存枚举失败'
                    }), 500
            
            elif action == 'update':
                # 更新枚举
                enum_path = get_enum_path(name, project)
                
                # 检查是否存在
                if not os.path.exists(enum_path):
                    return jsonify({
                        'success': False,
                        'error': f'枚举 "{name}" 不存在'
                    }), 404
                
                enum_data = data.get('data', {})
                if write_json_file(enum_path, enum_data):
                    return jsonify({
                        'success': True,
                        'message': '枚举更新成功'
                    })
                else:
                    return jsonify({
                        'success': False,
                        'error': '保存枚举失败'
                    }), 500
            
            elif action == 'delete':
                # 删除枚举
                enum_path = get_enum_path(name, project)
                
                try:
                    # 删除枚举文件
                    if os.path.exists(enum_path):
                        os.remove(enum_path)
                    
                    return jsonify({
                        'success': True,
                        'message': '枚举删除成功'
                    })
                except Exception as e:
                    return jsonify({
                        'success': False,
                        'error': f'删除枚举失败: {str(e)}'
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


@app.route('/api/lua-types', methods=['GET'])
def lua_types_handler():
    """获取Lua值类型列表"""
    return jsonify({
        'success': True,
        'data': lua_value_types
    })


@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查接口"""
    return jsonify({
        'success': True,
        'message': '服务运行正常'
    })


if __name__ == '__main__':
    print('配表系统后端服务启动中...')
    
    # 迁移旧数据结构到新的项目结构
    migrate_old_structure()
    
    # 解析 enum.lua
    parse_enum_lua()
    
    print('服务地址: http://localhost:5001')
    print('Schema API: http://localhost:5001/api/schema')
    print('Enum API: http://localhost:5001/api/enum')
    print('Data API: http://localhost:5001/api/data')
    print('Projects API: http://localhost:5001/api/projects')
    print('Lua Types API: http://localhost:5001/api/lua-types')
    print('按 Ctrl+C 停止服务')
    app.run(host='0.0.0.0', port=5001, debug=True)
