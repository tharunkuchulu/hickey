interface Props {
  onDigit: (d: string) => void
  onBackspace: () => void
  onClear: () => void
  onEnter?: () => void
  enterLabel?: string
}

/** Touch numpad used for PIN login, quantities, discounts and cash tendered. */
export function NumPad({ onDigit, onBackspace, onClear, onEnter, enterLabel = 'OK' }: Props) {
  const key = 'h-14 rounded-md bg-white border border-gray-300 text-xl font-semibold active:bg-gray-200 shadow-sm'
  return (
    <div className="grid grid-cols-3 gap-2 w-64">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
        <button key={d} className={key} onClick={() => onDigit(d)}>
          {d}
        </button>
      ))}
      <button className={`${key} text-base`} onClick={onClear}>
        C
      </button>
      <button className={key} onClick={() => onDigit('0')}>
        0
      </button>
      <button className={`${key} text-base`} onClick={onBackspace}>
        ⌫
      </button>
      {onEnter && (
        <button className="col-span-3 h-14 rounded-md bg-brand-600 text-white text-lg font-semibold active:bg-brand-700" onClick={onEnter}>
          {enterLabel}
        </button>
      )}
    </div>
  )
}
