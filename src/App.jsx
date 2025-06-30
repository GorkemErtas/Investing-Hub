import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Portfolio from './pages/Portfolio';
import LearningHub from './pages/LearningHub';
import Auth from './pages/Auth';
import Navbar from './components/Navbar';
import axios from 'axios';

axios.defaults.baseURL = import.meta.env.VITE_API_URL;


//deneme



function App() {
  return (
    <Router>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/learning-hub" element={<LearningHub />} />
        <Route path="/auth" element={<Auth />} />
      </Routes>
    </Router>
  );
}




export default App;

//deneme
