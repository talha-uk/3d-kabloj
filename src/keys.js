export function bindTabs(tablist, onSelect) {
  const tabs = () => [...tablist.querySelectorAll('[role="tab"]')]

  function select(tab, focus) {
    for (const item of tabs()) {
      const on = item === tab
      item.setAttribute('aria-selected', on ? 'true' : 'false')
      item.toggleAttribute('focusgroupstart', on)
    }
    const panel = document.getElementById('gorunum')
    panel.setAttribute('aria-labelledby', tab.id)
    onSelect(tab.dataset.mode)
    if (focus) tab.focus()
  }

  tablist.addEventListener('click', (event) => {
    const tab = event.target.closest('[role="tab"]')
    if (tab) select(tab, false)
  })

  if (!('focusGroup' in HTMLElement.prototype)) {
    const items = tabs()
    items.forEach((button, index) => {
      button.tabIndex = index === 0 ? 0 : -1
    })
    tablist.addEventListener('focusin', (event) => {
      const items = tabs()
      if (items.includes(event.target)) {
        items.forEach((button) => {
          button.tabIndex = button === event.target ? 0 : -1
        })
      }
    })
    tablist.addEventListener('keydown', (event) => {
      const items = tabs()
      const index = items.indexOf(document.activeElement)
      if (index < 0) return
      const rtl = getComputedStyle(tablist).direction === 'rtl'
      const steps = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }
      let next = null
      if (event.key === 'Home') next = items[0]
      else if (event.key === 'End') next = items[items.length - 1]
      else if (steps[event.key]) next = items[(index + steps[event.key] + items.length) % items.length]
      if (!next) return
      event.preventDefault()
      next.focus()
      select(next, false)
    })
  } else {
    tablist.addEventListener('focusin', (event) => {
      const tab = event.target.closest?.('[role="tab"]')
      if (tab && tab.getAttribute('aria-selected') !== 'true') select(tab, false)
    })
  }

  return {
    setMode(mode) {
      const tab = tabs().find((item) => item.dataset.mode === mode)
      if (!tab || tab.getAttribute('aria-selected') === 'true') return
      for (const item of tabs()) {
        const on = item === tab
        item.setAttribute('aria-selected', on ? 'true' : 'false')
        item.toggleAttribute('focusgroupstart', on)
        if (!('focusGroup' in HTMLElement.prototype)) item.tabIndex = on ? 0 : -1
      }
      document.getElementById('gorunum').setAttribute('aria-labelledby', tab.id)
    }
  }
}

export function bindToolbar(toolbar) {
  if ('focusGroup' in HTMLElement.prototype) return
  const items = () => [...toolbar.querySelectorAll('button')]
  const list = items()
  list.forEach((button, index) => {
    button.tabIndex = index === 0 ? 0 : -1
  })
  toolbar.addEventListener('focusin', (event) => {
    const list = items()
    if (list.includes(event.target)) {
      list.forEach((button) => {
        button.tabIndex = button === event.target ? 0 : -1
      })
    }
  })
  toolbar.addEventListener('keydown', (event) => {
    const list = items()
    const index = list.indexOf(document.activeElement)
    if (index < 0) return
    const rtl = getComputedStyle(toolbar).direction === 'rtl'
    const steps = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }
    let next = null
    if (event.key === 'Home') next = list[0]
    else if (event.key === 'End') next = list[list.length - 1]
    else if (steps[event.key]) next = list[(index + steps[event.key] + list.length) % list.length]
    if (!next) return
    event.preventDefault()
    next.focus()
  })
}
