// src/components/ui/Input.jsx
const Input = ({ label, error, className = '', ...props }) => {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm font-medium text-gray-300">
          {label}
        </label>
      )}
      <input
        className={`
          bg-gray-800 border rounded-lg px-4 py-2.5 text-white
          placeholder-gray-500 text-sm outline-none transition-colors
          ${error
            ? 'border-red-500 focus:border-red-400'
            : 'border-gray-700 focus:border-violet-500'}
          ${className}
        `}
        {...props}
      />
      {error && (
        <span className="text-red-400 text-xs">{error}</span>
      )}
    </div>
  )
}

export default Input
