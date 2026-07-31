function MiniStub({ card }) {
  return (
    <div className="mini-stub">
      <span className="mini-stub-kicker">{card.kicker}</span>
      {card.rows.map(([label, value]) => (
        <div className="mini-stub-row" key={label}>
          <span>{label}</span>
          <span>{value}</span>
        </div>
      ))}
      <div className="mini-stub-status">
        <span className="mini-stub-dot" />
        {card.status}
      </div>
    </div>
  )
}

export default MiniStub
