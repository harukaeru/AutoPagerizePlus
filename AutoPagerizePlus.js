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

const insertAfter = (newNode, referenceNode) => {
  referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling)
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
    return new Page(
      this.getContents(d),
      this.getNextLink(d)
    )
  }
}

class Page {
  constructor(contents, nextLink) {
    this.contents = contents
    this.nextLink = nextLink
  }
}

function createPageTitle(page, isButton = true, isEnded = false) {
  let div = document.createElement('div')
  div.style.backgroundColor = '#ddd'
  if (isButton) {
    let backButton = document.createElement('button')
    backButton.innerHTML = "Go To Previous WebSite"
    backButton.addEventListener('click', () => window.history.go(-store.state.pushCount))
    backButton.style.float = 'left'
    div.appendChild(backButton)
  }

  let displayFooterButton = document.createElement('button')
  displayFooterButton.innerHTML = 'Toggle On/Off'
  displayFooterButton.addEventListener('click', () => {
    // _TODO_ ON / OFF logic
    store.resetListener()
    document.location = page.location
  })
  let pageName = document.createElement('span')
  pageName.innerHTML = isEnded ? "PAGE_ENDED" : (page.location ? `${page.location}` : page)

  pageName.style.float = 'right'
  let clearfix = document.createElement('div')
  clearfix.style.clear = 'both'

  div.appendChild(displayFooterButton)
  div.appendChild(pageName)
  div.appendChild(clearfix)
  return div
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

const render = (page, pageIndex) => {
  let div = createPageTitle(page)
  insertAfter(div, lastContent)
  const elemName = `k4eRo0-${pageIndex}`
  div.appendClass(elemName)

  lastContent = div

  page.contents.forEach(pageContent => {
    insertAfter(pageContent, lastContent)
    lastContent = pageContent
  })

  if (page.nextLink == DOES_NOT_HAVE_LINK) {
    let endDiv = createPageTitle(page, true, true)
    endDiv.style.color = 'red'
    insertAfter(endDiv, lastContent)
    lastContent = endDiv
  }
}

const renderError = (nextLink) => {
  let div = createPageTitle(`ERROR HAS BEEN OCCURED at loading ${nextLink}. Something is happened. Reload it.` , false)
  div.style.color = 'red'
  insertAfter(div, lastContent)
  lastContent = div
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

  const subscribe = (listener) => {
    listeners.push(listener)
  }

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

function* idMaker() {
  var index = 0;
  while(true)
    yield index++;
}

let gen = idMaker()

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
      window.history.pushState({ pageNum: currentPageNum, gen: gen.next().value }, currentPageNum, currentPageLocation)
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
