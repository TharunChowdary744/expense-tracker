import { createBrowserRouter } from 'react-router'
import { routerBasename } from './basePath'
import { routes } from './routes'

export const router = createBrowserRouter(routes, { basename: routerBasename() })
