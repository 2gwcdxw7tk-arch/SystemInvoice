"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface PickerOption {
    code: string;
    name: string;
}

interface KardexPickerModalProps<T extends PickerOption> {
    open: boolean;
    onClose: () => void;
    title: string;
    options: T[];
    selectedCodes: string[];
    onSelectionChange: (codes: string[]) => void;
}

export function KardexPickerModal<T extends PickerOption>({
    open,
    onClose,
    title,
    options,
    selectedCodes,
    onSelectionChange,
}: KardexPickerModalProps<T>) {
    const [searchTerm, setSearchTerm] = useState("");

    const filteredOptions = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) return options;
        return options.filter(
            (option) => option.code.toLowerCase().includes(term) || option.name.toLowerCase().includes(term)
        );
    }, [options, searchTerm]);

    const handleRowClick = (code: string) => {
        const next = selectedCodes.includes(code)
            ? selectedCodes.filter((c) => c !== code)
            : [...selectedCodes, code];
        onSelectionChange(next);
    };

    const handleClose = () => {
        setSearchTerm("");
        onClose();
    };

    return (
        <Modal open={open} onClose={handleClose} title={title} contentClassName="max-w-3xl">
            <div className="space-y-4">
                <Input
                    placeholder="Buscar..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    autoFocus
                />
                <div className="max-h-80 overflow-y-auto rounded-2xl border border-muted">
                    <table className="min-w-full table-auto text-left text-sm text-foreground">
                        <thead className="border-b text-xs uppercase text-muted-foreground">
                            <tr>
                                <th className="px-4 py-2">Código</th>
                                <th className="px-4 py-2">Nombre</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredOptions.map((item) => (
                                <tr
                                    key={item.code}
                                    className={`cursor-pointer ${selectedCodes.includes(item.code) ? "bg-primary/10" : "hover:bg-muted/40"
                                        }`}
                                    onClick={() => handleRowClick(item.code)}
                                >
                                    <td className="px-4 py-2 font-mono text-xs">{item.code}</td>
                                    <td className="px-4 py-2">{item.name}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <Button onClick={handleClose} className="w-full">
                    Listo
                </Button>
            </div>
        </Modal>
    );
}
