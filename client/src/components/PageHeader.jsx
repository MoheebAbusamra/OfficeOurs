// Consistent page title block: small hand-written eyebrow, big title, optional description and actions
export default function PageHeader({ eyebrow, title, description, children }) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div>{children}</div>}
    </div>
  );
}
