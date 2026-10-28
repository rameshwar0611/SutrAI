import Home from './pages/Home'
import { useAuthFlow } from './hooks/useAuthFlow'

export default function App() {
  const authFlow = useAuthFlow()
  return <Home authFlow={authFlow} />
}
