/* prepare */
const DOES_NOT_HAVE_LINK = Symbol()

Array.prototype.last = function(){
    return this[this.length - 1]
}

Array.prototype.first = function(){
  return this[0]
}

HTMLElement.prototype.appendClass = function(className) {
    this.className += ` ${className}`;
}

function getElementsByXPath(path, d) {
  let elems = d.evaluate(path, d, null, XPathResult.ANY_ORDERED_NODE_TYPE, null)
  return elems
}

function getFirstElementByXPath(path, d) {
  return d.evaluate(path, d, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue
}

class PageParser {
  constructor(sitemap) {
    this.contentXPath = sitemap.pageElement
    this.nextLinkXPath = sitemap.nextLink
  }

  getContents(d) {
    const xpathGen = getElementsByXPath(this.contentXPath, d)
    let xpathElems = []
    while (true) {
      let elem = xpathGen.iterateNext()
      if (elem) {
        xpathElems.push(elem)
      } else {
        break
      }
    }
    return xpathElems
  }

  getNextLink(d) {
    const pathElem = getFirstElementByXPath(this.nextLinkXPath, d)
    if (!pathElem) {
      return DOES_NOT_HAVE_LINK
    }
    const href = pathElem.getAttribute('href')
    return href
  }

  parse(d) {
    return new Page(this.getContents(d), this.getNextLink(d))
  }
}

class Page {
  constructor(contents, nextLink) {
    this.contents = contents
    this.nextLink = nextLink
  }
}

function createTerminal() {
  let _terminal = document.createElement('div')
  _terminal.style.backgroundColor = '#ddd'

  _terminal.floatLeft = (elem) => {
    elem.style.float = 'left'
    _terminal.appendChild(elem)
    return _terminal
  }
  _terminal.floatRight = (elem) => {
    elem.style.float = 'right'
    _terminal.appendChild(elem)
    return _terminal
  }
  _terminal.clear = () => {
    let clear = document.createElement('div')
    clear.style.clear = 'both'
    _terminal.appendChild(clear)
    return _terminal
  }
  return _terminal
}

function createPrevButton() {
  let prevButton = document.createElement('button')
  prevButton.innerHTML = "Go To Previous WebSite"
  prevButton.addEventListener('click', () => window.history.go(-store.state.pushCount))
  return prevButton
}

function createDisplayFooterButton(page) {
 let displayFooterButton = document.createElement('button')
  displayFooterButton.innerHTML = 'Toggle On/Off'
  displayFooterButton.addEventListener('click', () => {
    // _TODO_ ON / OFF logic
    store.resetListener()
    document.location = page.location
  })
  return displayFooterButton
}

function createDisplayPathSpan(page) {
  let displayPathSpan = document.createElement('span')
  displayPathSpan.innerHTML = page.location
  return displayPathSpan
}

function createDisplayMessage(msg) {
  let displayMessage = document.createElement('span')
  displayMessage.innerHTML = msg
  displayMessage.style.color = 'red'
  return displayMessage
}

/* Input */
sitemap = {
  pageElement: "id('novel_color')/*[@class='novel_subtitle' or @id='novel_p' or @id='novel_a' or @id='novel_honbun']",
  nextLink: "//div[@class='novel_bn']/a[contains(.,'次の話')]"
  // pageElement: "id('res')//li[div]|//div[@class='gsc-webResult gsc-result' or @class='psli']|id('rso')//div[contains(concat(' ', normalize-space(@class), ' '), ' g ') or contains(concat(' ', normalize-space(@class), ' '), ' g _cy ')]",
  // nextLink: "id('pnnext')|id('navbar navcnt nav')//td[span]/following-sibling::td[1]/a|id('nn')/parent::a"
}
const LIMIT = 6

/* Initialize */
const pageParser = new PageParser(sitemap)

let initPage = pageParser.parse(document, false)
initPage.location = document.location.href

let lastContent = initPage.contents.last()

const insertAfterLastContent = (inserteeNode) => {
  lastContent.parentNode.insertBefore(inserteeNode, lastContent.nextSibling)
  lastContent = inserteeNode
}

const render = (page, pageIndex) => {
  let terminal = createTerminal()
    .floatLeft(createPrevButton())
    .floatLeft(createDisplayFooterButton(page))
    .floatRight(createDisplayPathSpan())
    .clear()

  insertAfterLastContent(terminal)

  page.contents.forEach(pageContent => insertAfterLastContent(pageContent))
  if (page.nextLink == DOES_NOT_HAVE_LINK) {
    let lastTerminal = createTerminal().floatRight(createDisplayMessage('PAGE_ENDED')).clear()
    insertAfterLastContent(lastTerminal)
  }
}

const renderError = (nextLink) => {
  let terminal = createTerminal()
    .floatRight(
      createDisplayMessage(`ERROR HAS BEEN OCCURED at loading ${nextLink}. Something is happened. Reload it.`)
    ).clear()
  insertAfterLastContent(terminal)
}

/* logic statements */
// Redux-like store
const store = (() => {
  let state = {
    nextLink: null,
    currentPageNum: 0,
    maxWentPageNum: 0,
    pages: [],
    isFetching: false,
    pushCount: 1
  }
  let listeners = []

  const changeState = (callback) => {
    callback(state)
    listeners.forEach(listener => listener(state))
  }

  const subscribe = (listener) => listeners.push(listener)

  const resetListener = () => {
    listeners = []
  }

  return {
    state, changeState, subscribe, resetListener
  }
})()

const domParser = new DOMParser()

function fetchNextPage(nextLink) {
  store.changeState(state => { state.isFetching = true })
  fetch(nextLink, {
    credentials: 'same-origin', redirect: 'follow'
  })
  .then(res => res.text())
  .then(html => domParser.parseFromString(html, "text/html"))
  .then(dom => pageParser.parse(dom))
  .then(nextPage => {
    nextPage.location = nextLink
    store.changeState(state => {
      render(nextPage, state.pages.length)
      state.pages.push(nextPage)
      state.nextLink = nextPage.nextLink
      state.isFetching = false
    })
  })
  .catch(e => {
    console.error(e)
    renderError(nextLink)
  })
}

function fetchNextPageIfPossible(state) {
  if (!state.isFetching && state.nextLink &&
    state.nextLink != DOES_NOT_HAVE_LINK &&
    state.pages.length < state.maxWentPageNum + LIMIT) {
    fetchNextPage(state.nextLink)
  }
}

window.addEventListener('scroll', () => {
  const height = window.innerHeight

  // Want to use Binary Search to fasten but... :(
  for (let pageIndex=0; pageIndex < store.state.pages.length; pageIndex++) {
    let page = store.state.pages[pageIndex]
    const firstContent = page.contents.first()
    const canSeePage = firstContent.getBoundingClientRect().top <= height
    if (canSeePage) {
      currentPageNum = pageIndex
    } else {
      break
    }
  }
  store.changeState(state => {
    if (state.currentPageNum != currentPageNum) {
      state.currentPageNum = currentPageNum
      if (currentPageNum > state.maxWentPageNum) {
        state.maxWentPageNum = currentPageNum
      }
      const currentPageLocation = state.pages[state.currentPageNum].location
      window.history.pushState({}, currentPageNum, currentPageLocation)
      state.pushCount += 1
    }
  })
})

/* main */
store.subscribe(fetchNextPageIfPossible)
store.changeState(state => { state.pages.push(initPage) })
if (initPage.nextLink === null) {
  console.error("NO SITEMAP IS THERE.")
} else {
  fetchNextPage(initPage.nextLink)
}
