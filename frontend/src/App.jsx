import { useState, useEffect } from "react";
import { fetchApi } from "./utils/api";
function App() {
  const [data, setData] = useState(null);

  // useEffect(() => {
  //   fetch("http://localhost:8000/api/message")
  //     .then((response) => response.json())
  //     .then((data) => setData(data.message))
  //     .catch((error) => console.error("Error fetching data:", error));
  // }, []);
  useEffect(() => {
    const loadData = async () => {
      try {      
        const response = await fetchApi("/api/health");
        setData(response.message);
      } catch (err) {
        console.error("Error fetching data:", err);
        setError(err.message);
      }
    };
    loadData();
  }, []);

  return (
    <div>
      <h1>React + FastAPI</h1>
      <p>Backend says: {data ? data : "Loading..."}</p>
    </div>
  );
}

export default App;
