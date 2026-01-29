import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import JoinInterview from './components/JoinInterview'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/interview/:roomId" element={<JoinInterview />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
