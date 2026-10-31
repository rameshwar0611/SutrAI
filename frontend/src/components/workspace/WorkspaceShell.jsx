export default function WorkspaceShell({ navigation, header, status, children, artifact, overlays }) {
  return (
    <div className="contour-app">
      <a href="#workspace" className="contour-skip-link">Skip to workspace</a>
      {navigation}
      <div className="contour-workspace">
        {header}
        <div className="contour-workspace__body">
          <div className="contour-workspace__column">
            {status}
            <main id="workspace" tabIndex={-1} className="contour-chat-main">{children}</main>
          </div>
          {artifact}
        </div>
      </div>
      {overlays}
    </div>
  )
}
