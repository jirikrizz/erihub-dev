<?php

namespace Modules\Inventory\Services;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use RuntimeException;

class InventoryPurchaseOrderImporter
{
    /**
     * @return array<array{code:string,quantity:float}>
     */
    public function parse(string $path): array
    {
        if (! is_file($path)) {
            throw new RuntimeException('Soubor se nepodařilo nahrát.');
        }

        $spreadsheet = IOFactory::load($path);
        $sheet = $spreadsheet->getActiveSheet();
        $rows = $sheet->toArray(null, true, true, true);

        if (empty($rows)) {
            throw new RuntimeException('Soubor je prázdný.');
        }

        [$codeColumn, $quantityColumn, $hasHeader] = $this->detectColumns($rows);

        $items = [];
        foreach ($rows as $index => $row) {
            if ($index === array_key_first($rows) && $hasHeader) {
                continue;
            }

            $rawCode = $row[$codeColumn] ?? null;
            $rawQuantity = $row[$quantityColumn] ?? null;

            $code = is_string($rawCode) ? trim($rawCode) : (is_numeric($rawCode) ? (string) $rawCode : '');
            $quantity = is_numeric($rawQuantity) ? (float) $rawQuantity : null;

            if ($code === '' || $quantity === null) {
                continue;
            }

            if ($quantity <= 0) {
                continue;
            }

            if (! isset($items[$code])) {
                $items[$code] = [
                    'code' => $code,
                    'quantity' => 0.0,
                ];
            }

            $items[$code]['quantity'] += $quantity;
        }

        if ($items === []) {
            throw new RuntimeException('Soubor neobsahuje žádné platné řádky s kódem a množstvím.');
        }

        return array_values($items);
    }

    /**
     * @param array<int|string,array<string|null>> $rows
     * @return array{0:string,1:string,2:bool}
     */
    private function detectColumns(array $rows): array
    {
        $firstKey = array_key_first($rows);
        $firstRow = $firstKey !== null ? $rows[$firstKey] : [];

        $normalized = Collection::make($firstRow ?? [])
            ->mapWithKeys(function ($value, $column) {
                $label = is_string($value) ? Str::lower(trim($value)) : '';

                return [$column => $label];
            });

        $codeAliases = ['code', 'kód', 'kod', 'product id', 'variant', 'variant code', 'sku'];
        $quantityAliases = ['order', 'quantity', 'qty', 'počet', 'objednáno', 'amount', 'ordered'];

        $codeColumn = $this->matchColumn($normalized, $codeAliases, 'A');
        $quantityColumn = $this->matchColumn($normalized, $quantityAliases, 'B');

        $hasHeader = $this->rowLooksLikeHeader($normalized, $codeColumn, $quantityColumn);

        return [$codeColumn, $quantityColumn, $hasHeader];
    }

    /**
     * @param \Illuminate\Support\Collection<string,string> $normalizedRow
     */
    private function matchColumn(Collection $normalizedRow, array $aliases, string $fallback): string
    {
        foreach ($normalizedRow as $column => $value) {
            foreach ($aliases as $alias) {
                if ($value !== '' && Str::contains($value, Str::lower($alias))) {
                    return $column;
                }
            }
        }

        return $fallback;
    }

    /**
     * @param \Illuminate\Support\Collection<string,string> $normalizedRow
     */
    private function rowLooksLikeHeader(Collection $normalizedRow, string $codeColumn, string $quantityColumn): bool
    {
        $codeValue = $normalizedRow->get($codeColumn);
        $quantityValue = $normalizedRow->get($quantityColumn);

        if ($codeValue && ! is_numeric($codeValue)) {
            return true;
        }

        if ($quantityValue && ! is_numeric($quantityValue)) {
            return true;
        }

        return false;
    }
}
