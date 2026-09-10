import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import TopicSetup from './pages/TopicSetup'
import Classroom from './pages/Classroom'
import PlainChat from './pages/PlainChat'
import Checkpoint from './pages/Checkpoint'
import Progress from './pages/Progress'
import Quizzes from './pages/Quizzes'
import Settings from './pages/Settings'
import About from './pages/About'

function isLoggedIn() {
  return !!localStorage.getItem('aikyro_token')
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return isLoggedIn() ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/topic-setup"
          element={
            <ProtectedRoute>
              <TopicSetup />
            </ProtectedRoute>
          }
        />
        <Route
          path="/classroom/:sessionId"
          element={
            <ProtectedRoute>
              <Classroom />
            </ProtectedRoute>
          }
        />
        {/* the plain-chat baseline arm (HLD 6.3 control condition) */}
        <Route
          path="/plain-chat/:sessionId"
          element={
            <ProtectedRoute>
              <PlainChat />
            </ProtectedRoute>
          }
        />
        <Route
          path="/checkpoint/:sessionId"
          element={
            <ProtectedRoute>
              <Checkpoint />
            </ProtectedRoute>
          }
        />
        <Route
          path="/progress"
          element={
            <ProtectedRoute>
              <Progress />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/quizzes"
          element={
            <ProtectedRoute>
              <Quizzes />
            </ProtectedRoute>
          }
        />
        <Route
          path="/about"
          element={
            <ProtectedRoute>
              <About />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to={isLoggedIn() ? '/dashboard' : '/login'} replace />} />
      </Routes>
    </BrowserRouter>
  )
}
