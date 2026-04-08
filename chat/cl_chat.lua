local chatInputActive = false
local chatInputActivating = false
local chatHidden = true
local chatLoaded = false

local POSITION_KVP_KEY = 'chat_position'
local STYLE_KVP_KEY = 'chat_style'

local DEFAULT_POSITION = {
  xRatio = 0.015,
  yRatio = 0.05
}

local DEFAULT_STYLE = {
  box = {
    h = 0,
    s = 0,
    v = 7,
    a = 84,
    glow = 0
  },
  text = {
    h = 0,
    s = 0,
    v = 100,
    a = 100,
    glow = 0
  }
}

RegisterNetEvent('chatMessage')
RegisterNetEvent('chat:addTemplate')
RegisterNetEvent('chat:addMessage')
RegisterNetEvent('chat:addSuggestions')
RegisterNetEvent('chat:addSuggestion')
RegisterNetEvent('chat:removeSuggestion')
RegisterNetEvent('chat:clear')

-- internal events
RegisterNetEvent('__cfx_internal:serverPrint')
RegisterNetEvent('_chat:messageEntered')

local function clamp(value, minValue, maxValue)
  if value < minValue then
    return minValue
  end

  if value > maxValue then
    return maxValue
  end

  return value
end

local function getDefaultPosition()
  return {
    xRatio = DEFAULT_POSITION.xRatio,
    yRatio = DEFAULT_POSITION.yRatio
  }
end

local function getSavedPosition()
  local raw = GetResourceKvpString(POSITION_KVP_KEY)
  if not raw or raw == '' then
    return getDefaultPosition()
  end

  local ok, decoded = pcall(json.decode, raw)
  if not ok or type(decoded) ~= 'table' then
    return getDefaultPosition()
  end

  local xRatio = tonumber(decoded.xRatio)
  local yRatio = tonumber(decoded.yRatio)

  if not xRatio or not yRatio then
    return getDefaultPosition()
  end

  return {
    xRatio = clamp(xRatio, 0.0, 1.0),
    yRatio = clamp(yRatio, 0.0, 1.0)
  }
end

local function normalizeStyleEntry(entry, fallback)
  local source = type(entry) == 'table' and entry or {}

  return {
    h = math.floor(clamp(tonumber(source.h) or fallback.h, 0.0, 360.0) + 0.5),
    s = math.floor(clamp(tonumber(source.s) or fallback.s, 0.0, 100.0) + 0.5),
    v = math.floor(clamp(tonumber(source.v) or fallback.v, 0.0, 100.0) + 0.5),
    a = math.floor(clamp(tonumber(source.a) or fallback.a, 0.0, 100.0) + 0.5),
    glow = math.floor(clamp(tonumber(source.glow) or fallback.glow, 0.0, 100.0) + 0.5)
  }
end

local function getDefaultStyle()
  return {
    box = normalizeStyleEntry(DEFAULT_STYLE.box, DEFAULT_STYLE.box),
    text = normalizeStyleEntry(DEFAULT_STYLE.text, DEFAULT_STYLE.text)
  }
end

local function normalizeStyle(style)
  local source = type(style) == 'table' and style or {}

  return {
    box = normalizeStyleEntry(source.box, DEFAULT_STYLE.box),
    text = normalizeStyleEntry(source.text, DEFAULT_STYLE.text)
  }
end

local function getSavedStyle()
  local raw = GetResourceKvpString(STYLE_KVP_KEY)
  if not raw or raw == '' then
    return getDefaultStyle()
  end

  local ok, decoded = pcall(json.decode, raw)
  if not ok or type(decoded) ~= 'table' then
    return getDefaultStyle()
  end

  return normalizeStyle(decoded)
end

local function sendSavedPosition()
  SendNUIMessage({
    type = 'ON_POSITION_LOAD',
    position = getSavedPosition()
  })
end

local function sendSavedStyle()
  SendNUIMessage({
    type = 'ON_STYLE_LOAD',
    style = getSavedStyle()
  })
end

-- deprecated, use chat:addMessage
AddEventHandler('chatMessage', function(author, ctype, text)
  if author == nil or text == nil then
    return
  end

  local messageType = ctype ~= false and ctype or 'normal'

  SendNUIMessage({
    type = 'ON_MESSAGE',
    message = {
      template = '<div class="chat-message ' .. messageType .. '"><div class="chat-message-body"><strong>{0}:</strong> {1}</div></div>',
      args = { author, text }
    }
  })
end)

AddEventHandler('__cfx_internal:serverPrint', function(msg)
  SendNUIMessage({
    type = 'ON_MESSAGE',
    message = {
      templateId = 'print',
      multiline = true,
      args = { msg }
    }
  })
end)

AddEventHandler('chat:addMessage', function(message)
  SendNUIMessage({
    type = 'ON_MESSAGE',
    message = message
  })
end)

AddEventHandler('chat:addSuggestion', function(name, help, params)
  SendNUIMessage({
    type = 'ON_SUGGESTION_ADD',
    suggestion = {
      name = name,
      help = help,
      params = params or nil
    }
  })
end)

AddEventHandler('chat:addSuggestions', function(suggestions)
  for i = 1, #suggestions do
    SendNUIMessage({
      type = 'ON_SUGGESTION_ADD',
      suggestion = suggestions[i]
    })
  end
end)

AddEventHandler('chat:removeSuggestion', function(name)
  SendNUIMessage({
    type = 'ON_SUGGESTION_REMOVE',
    name = name
  })
end)

AddEventHandler('chat:addTemplate', function(id, html)
  SendNUIMessage({
    type = 'ON_TEMPLATE_ADD',
    template = {
      id = id,
      html = html
    }
  })
end)

AddEventHandler('chat:clear', function(resetPosition)
  local payload = {
    type = 'ON_CLEAR'
  }

  if resetPosition then
    DeleteResourceKvp(POSITION_KVP_KEY)
    payload.resetPosition = true
    payload.position = getDefaultPosition()
  end

  SendNUIMessage(payload)
end)

RegisterNUICallback('chatResult', function(data, cb)
  chatInputActive = false
  SetNuiFocus(false, false)

  if not data.canceled then
    local id = PlayerId()
    local message = tostring(data.message or '')

    -- deprecated
    local r, g, b = 0, 0x99, 255

    if message:sub(1, 1) == '/' then
      ExecuteCommand(message:sub(2))
    else
      TriggerServerEvent('_chat:messageEntered', GetPlayerName(id), { r, g, b }, message)
    end
  end

  cb('ok')
end)

RegisterNUICallback('chatPositionSave', function(data, cb)
  local xRatio = tonumber(data.xRatio)
  local yRatio = tonumber(data.yRatio)

  if xRatio and yRatio then
    SetResourceKvp(POSITION_KVP_KEY, json.encode({
      xRatio = clamp(xRatio, 0.0, 1.0),
      yRatio = clamp(yRatio, 0.0, 1.0)
    }))
  end

  cb('ok')
end)

RegisterNUICallback('chatStyleSave', function(data, cb)
  if type(data) == 'table' and type(data.style) == 'table' then
    SetResourceKvp(STYLE_KVP_KEY, json.encode(normalizeStyle(data.style)))
  end

  cb('ok')
end)

RegisterNUICallback('chatStyleReset', function(_, cb)
  DeleteResourceKvp(STYLE_KVP_KEY)
  sendSavedStyle()
  cb('ok')
end)

RegisterNUICallback('chatPositionReset', function(_, cb)
  DeleteResourceKvp(POSITION_KVP_KEY)
  sendSavedPosition()
  cb('ok')
end)

local function refreshCommands()
  if not GetRegisteredCommands then
    return
  end

  local registeredCommands = GetRegisteredCommands()
  local suggestions = {}

  for i = 1, #registeredCommands do
    local command = registeredCommands[i]

    if IsAceAllowed(('command.%s'):format(command.name)) then
      suggestions[#suggestions + 1] = {
        name = '/' .. command.name,
        help = ''
      }
    end
  end

  TriggerEvent('chat:addSuggestions', suggestions)
end

local function refreshThemes()
  local themes = {}

  for resIdx = 0, GetNumResources() - 1 do
    local resource = GetResourceByFindIndex(resIdx)

    if GetResourceState(resource) == 'started' then
      local numThemes = GetNumResourceMetadata(resource, 'chat_theme')

      if numThemes > 0 then
        local themeName = GetResourceMetadata(resource, 'chat_theme')
        local themeData = json.decode(GetResourceMetadata(resource, 'chat_theme_extra') or 'null')

        if themeName and themeData then
          themeData.baseUrl = 'nui://' .. resource .. '/'
          themes[themeName] = themeData
        end
      end
    end
  end

  SendNUIMessage({
    type = 'ON_UPDATE_THEMES',
    themes = themes
  })
end

AddEventHandler('onClientResourceStart', function(resName)
  Wait(500)

  refreshCommands()
  refreshThemes()

  if chatLoaded then
    sendSavedPosition()
    sendSavedStyle()
  end
end)

AddEventHandler('onClientResourceStop', function(resName)
  if resName ~= GetCurrentResourceName() then
    return
  end

  Wait(500)

  refreshCommands()
  refreshThemes()
end)

RegisterNUICallback('loaded', function(_, cb)
  TriggerServerEvent('chat:init')

  refreshCommands()
  refreshThemes()

  chatLoaded = true
  sendSavedPosition()
  sendSavedStyle()

  cb('ok')
end)

CreateThread(function()
  SetTextChatEnabled(false)
  SetNuiFocus(false, false)

  while true do
    local waitTime = 150

    if not chatInputActive then
      if IsControlPressed(0, 245) then -- INPUT_MP_TEXT_CHAT_ALL
        chatInputActive = true
        chatInputActivating = true
        waitTime = 0

        SendNUIMessage({
          type = 'ON_OPEN'
        })
      end
    else
      waitTime = 0
    end

    if chatInputActivating then
      waitTime = 0

      if not IsControlPressed(0, 245) then
        SetNuiFocus(true, true)
        chatInputActivating = false
      end
    end

    if chatLoaded then
      local shouldBeHidden = IsScreenFadedOut() or IsPauseMenuActive()

      if shouldBeHidden ~= chatHidden then
        chatHidden = shouldBeHidden

        SendNUIMessage({
          type = 'ON_SCREEN_STATE_CHANGE',
          shouldHide = shouldBeHidden
        })
      end
    end

    Wait(waitTime)
  end
end)
