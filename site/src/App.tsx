import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Footer, Navbar } from "./components/Layout";
import { PointerField } from "./components/Motion";
import Mutants from "./views/Mutants";
import Overview from "./views/Overview";
import Replay from "./views/Replay";

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <PointerField />
      <Navbar />
      <main id="main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/replay" element={<Replay />} />
          <Route path="/mutants" element={<Mutants />} />
          <Route path="*" element={<Overview />} />
        </Routes>
      </main>
      <Footer />
    </BrowserRouter>
  );
}
