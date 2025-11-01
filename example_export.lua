---@namespace Tile

-- 鱼类配置表

---@class (exact) Rewards
---@field rewardType string 奖励类型
---@field rewardId integer? 奖励ID
---@field amount integer 数量
---@field probability integer? 概率

---@class (exact) Fish
---@field id integer 鱼类ID
---@field fishName string 鱼类名称
---@field fishType string 鱼类类型
---@field rarity string 稀有度
---@field weight string 重量范围
---@field catchDifficulty integer 捕获难度
---@field iconColor integer? 图标颜色
---@field rewards Rewards[]? 奖励列表

---@type table<string, Fish>
local result = {
    ["Fish.Carp"] = {
        id = 1, -- 鱼类ID
        fishName = "鲤鱼", -- 鱼类名称
        fishType = "freshwater", -- 鱼类类型
        rarity = "Common", -- 稀有度
        weight = "2-8", -- 重量范围
        catchDifficulty = 2, -- 捕获难度
        iconColor = 0xFFA500, -- 图标颜色
        rewards = {
            { rewardType = "金币", rewardId = 0, amount = 50, probability = 100 },
            { rewardType = "经验", rewardId = 0, amount = 10, probability = 100 }
        } -- 奖励列表
    },
    ["Fish.Bass"] = {
        id = 2, -- 鱼类ID
        fishName = "鲈鱼", -- 鱼类名称
        fishType = "freshwater", -- 鱼类类型
        rarity = "Rare", -- 稀有度
        weight = "3-10", -- 重量范围
        catchDifficulty = 4, -- 捕获难度
        iconColor = 0x4682B4, -- 图标颜色
        rewards = {
            { rewardType = "金币", rewardId = 0, amount = 120, probability = 100 },
            { rewardType = "经验", rewardId = 0, amount = 25, probability = 100 },
            { rewardType = "道具", rewardId = 1001, amount = 1, probability = 20 }
        } -- 奖励列表
    },
    ["Fish.Tuna"] = {
        id = 3, -- 鱼类ID
        fishName = "金枪鱼", -- 鱼类名称
        fishType = "saltwater", -- 鱼类类型
        rarity = "Epic", -- 稀有度
        weight = "50-200", -- 重量范围
        catchDifficulty = 7, -- 捕获难度
        iconColor = 0x1E90FF, -- 图标颜色
        rewards = {
            { rewardType = "金币", rewardId = 0, amount = 500, probability = 100 },
            { rewardType = "经验", rewardId = 0, amount = 80, probability = 100 },
            { rewardType = "道具", rewardId = 2001, amount = 1, probability = 50 }
        } -- 奖励列表
    },
    ["Fish.Dragon"] = {
        id = 4, -- 鱼类ID
        fishName = "龙鱼", -- 鱼类名称
        fishType = "legendary", -- 鱼类类型
        rarity = "Legendary", -- 稀有度
        weight = "100-500", -- 重量范围
        catchDifficulty = 10, -- 捕获难度
        iconColor = 0xFF4500, -- 图标颜色
        rewards = {
            { rewardType = "金币", rewardId = 0, amount = 2000, probability = 100 },
            { rewardType = "经验", rewardId = 0, amount = 300, probability = 100 },
            { rewardType = "道具", rewardId = 3001, amount = 1, probability = 100 },
            { rewardType = "道具", rewardId = 3002, amount = 1, probability = 30 }
        } -- 奖励列表
    }
}
return result
