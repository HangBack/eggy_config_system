---@namespace Tile

local AreaCode = require "game.enums.AreaCode"
local ItemCode = require "game.items.ItemCode"
local ConfigData = require "game.xxx.ConfigData"

-- 示例配置表 - 展示所有字段类型

---@class (exact) EntryList
---@field item_id string 物品ID
---@field item_name string 物品名称
---@field count integer 数量
---@field rarity string 稀有度

---@class (exact) Example
---@field config_name string 配置名称
---@field enum_field ConfigType 枚举类型
---@field text_field string 普通文本
---@field number_field integer 数值字段
---@field datalist_field string 数据列表
---@field entry_list EntryList[] 条目列表

---@type table<string, Example>
local result = {
    [ConfigData.Example1] = {
        config_name = "示例配置1", -- 配置名称
        enum_field = ConfigType.Normal, -- 枚举类型
        text_field = "这是普通文本", -- 普通文本
        number_field = 100, -- 数值字段
        datalist_field = AreaCode.Ocean, -- 数据列表
        entry_list = {
            { item_id = ItemCode.Fish001, item_name = "小丑鱼", count = 1, rarity = "common" },
            { item_id = ItemCode.Fish002, item_name = "鲷鱼", count = 2, rarity = "uncommon" }
        } -- 条目列表
    },
    ["示例配置2"] = {
        config_name = "示例配置2", -- 配置名称
        enum_field = ConfigType.Special, -- 枚举类型
        text_field = "特殊配置", -- 普通文本
        number_field = 200, -- 数值字段
        datalist_field = AreaCode.River, -- 数据列表
        entry_list = {
            { item_id = ItemCode.Fish003, item_name = "鲑鱼", count = 5, rarity = "rare" }
        } -- 条目列表
    },
    [ConfigData.Example3] = {
        config_name = "示例配置3", -- 配置名称
        enum_field = ConfigType.Rare, -- 枚举类型
        text_field = "稀有配置", -- 普通文本
        number_field = 500, -- 数值字段
        datalist_field = AreaCode.Lake, -- 数据列表
        entry_list = {
        } -- 条目列表
    }
}
return result
