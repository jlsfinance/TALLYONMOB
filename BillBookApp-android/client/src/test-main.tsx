
import { createRoot } from "react-dom/client";
import "./index.css";

const App = () => <div className="bg-primary text-white p-10">Hello Tailwind 4</div>;

createRoot(document.getElementById("root")!).render(<App />);
