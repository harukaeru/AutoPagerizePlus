/* prepare */
const NO_LINK = Symbol()

Array.prototype.last = function(){
    return this[this.length - 1]
}

Array.prototype.first = function(){
  return this[0]
}

HTMLDocument.prototype.getElementsByXPath = function(path) {
  return this.evaluate(path, this, null, XPathResult.ANY_ORDERED_NODE_TYPE, null)
}

HTMLDocument.prototype.getFirstElementByXPath = function(path, d) {
  return this.evaluate(path, this, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue
}

class PageParser {
  constructor(sitemap) {
    this.contentXPath = sitemap.pageElement
    this.nextLinkXPath = sitemap.nextLink
  }

  getContents(d) {
    const xpathGen = d.getElementsByXPath(this.contentXPath)
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
    const pathElem = d.getFirstElementByXPath(this.nextLinkXPath)
    if (!pathElem) {
      return NO_LINK
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

  const setStyle = (elem, styleType) => {
    Object.assign(elem.style, styleType)
    _terminal.appendChild(elem)
    return _terminal
  }

  _terminal.floatLeft = (elem) => setStyle(elem, { float: 'left' })
  _terminal.floatRight = (elem) => setStyle(elem, { float: 'right' })
  _terminal.clear = () => setStyle(document.createElement('div'), { clear: 'both' })

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
    document.location = page.link
  })
  return displayFooterButton
}

function createDisplayPathSpan(page) {
  let displayPathSpan = document.createElement('span')
  displayPathSpan.innerHTML = page.link
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
initPage.link = document.location.href

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
  if (page.nextLink == NO_LINK) {
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
    isFetching: false,
    linkToFetch: null,
    pages: [],
    currentPageNum: 0,
    maxWentPageNum: 0,
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
    nextPage.link = nextLink
    store.changeState(state => {
      render(nextPage, state.pages.length)
      state.pages.push(nextPage)
      state.linkToFetch = nextPage.nextLink
      state.isFetching = false
    })
  })
  .catch(e => {
    console.error(e)
    renderError(nextLink)
  })
}

function fetchNextPageIfPossible(state) {
  if (!state.isFetching && state.linkToFetch &&
    state.linkToFetch != NO_LINK &&
    state.pages.length < state.maxWentPageNum + LIMIT) {
    fetchNextPage(state.linkToFetch)
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
      const currentPageLocation = state.pages[state.currentPageNum].link
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
