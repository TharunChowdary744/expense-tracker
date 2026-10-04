import { appPath, routerBasename } from './basePath'

describe('routerBasename', () => {
  it('is "/" when served from the root', () => {
    expect(routerBasename('/')).toBe('/')
  })

  it('drops the trailing slash of a sub-path', () => {
    expect(routerBasename('/expense-tracker/dev/')).toBe('/expense-tracker/dev')
  })
})

describe('appPath', () => {
  it('leaves paths alone at the root', () => {
    expect(appPath('/sign-in', '/')).toBe('/sign-in')
  })

  it('prefixes the sub-path', () => {
    expect(appPath('/join/abc', '/expense-tracker/test/')).toBe('/expense-tracker/test/join/abc')
  })
})
