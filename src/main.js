/**
 * Application Entry Point
 * Initializes modules and populates mockup data.
 */

document.addEventListener('DOMContentLoaded', () => {
  
  // 1. Initialize Viewport Pan & Zoom
  const viewport = document.getElementById('viewport-container');
  const workspace = document.getElementById('bracket-workspace');
  
  if (viewport && workspace) {
    window.PanZoom.init(viewport, workspace);
  }

  // 2. Initialize UI Bindings
  window.UI.init();

  // 3. Populate Mock Participants for instant visualization
  const mockPlayers = [
    { name: "John Doe", companyId: "COMP001" },
    { name: "Jane Smith", companyId: "COMP002" },
    { name: "Alice Cooper", companyId: "COMP003" },
    { name: "Bob Marley", companyId: "COMP004" },
    { name: "Charlie Chaplin", companyId: "COMP005" },
    { name: "David Bowie", companyId: "COMP006" },
    { name: "Elton John", companyId: "COMP007" },
    { name: "Freddie Mercury", companyId: "COMP008" },
    { name: "George Michael", companyId: "COMP009" }
  ];

  try {
    mockPlayers.forEach(p => {
      window.BracketEngine.addParticipant(p.name, p.companyId);
    });
    
    // Auto generate starting bracket
    window.BracketEngine.generateBracket();
    
    // Refresh visual layers
    window.UI.renderAll();
    
    // Adjust workspace zoom-to-fit
    setTimeout(() => {
      window.PanZoom.recenter();
    }, 200);

  } catch (e) {
    console.error("Mock population error: ", e);
  }
});
