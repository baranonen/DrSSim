export const FIELD_SIZE = Object.freeze({ width: 100, height: 60 });

function coordinate(value) {
  if (!Number.isInteger(value) || value < 1 || value > 99) {
    throw new Error('Each axis in a four-digit tile address must be between 01 and 99.');
  }
}

export function validateDimensions(columns, rows) {
  coordinate(columns);
  coordinate(rows);
}

/** The first two digits count columns from the left; the last two count rows from the bottom, both one-based. */
export function formatAddress(column, row) {
  coordinate(column);
  coordinate(row);
  return String(column).padStart(2, '0') + String(row).padStart(2, '0');
}

export function parseAddress(address) {
  if (typeof address !== 'string' || !/^\d{4}$/.test(address)) {
    throw new Error('A tile address must be a four-digit string such as 0306.');
  }
  const column = Number(address.slice(0, 2));
  const row = Number(address.slice(2, 4));
  coordinate(column);
  coordinate(row);
  return { column, row };
}

export function createEmptyLayout(columns, rows) {
  validateDimensions(columns, rows);
  return Array.from({ length: columns * rows }, (_, index) => {
    const row = Math.floor(index / columns) + 1;
    const column = index % columns + 1;
    return { address: formatAddress(column, row), row, column, tile: 'Field' };
  });
}

/** Convert to top-down display rows only at the rendering boundary. */
export function screenPosition(column, row, rows) {
  coordinate(column);
  coordinate(row);
  coordinate(rows);
  if (row > rows) throw new Error('Tile row is outside the desk.');
  return {
    gridColumn: column,
    gridRow: rows - row + 1,
    x: (column - 1) * FIELD_SIZE.width,
    y: (rows - row) * FIELD_SIZE.height,
  };
}
