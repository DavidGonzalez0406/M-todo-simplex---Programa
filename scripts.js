document.getElementById("simplexForm").addEventListener("submit", function (evt) { 
    evt.preventDefault();

    const objFunc = sanitizeInput(document.getElementById("objective").value);
    const constrArray = document.getElementById("constraints").value.split("\n").filter(Boolean).map(sanitizeInput);
    const optType = document.getElementById("type").value;

    if (!objFunc || constrArray.length === 0) {
        alert("Por favor, ingresa la función objetivo y al menos una restricción.");
        return;
    }

    try {
        const output = solveSimplex(objFunc, constrArray, optType);
        document.getElementById("results").classList.remove("hidden");
        document.getElementById("solutionSteps").textContent = output;
    } catch (err) {
        document.getElementById("results").classList.remove("hidden");
        document.getElementById("solutionSteps").textContent = "Error: " + err.message;
    }
});

function sanitizeInput(input) {
    input = input.replace(/≤/g, "<="); 
    input = input.replace(/≥/g, ">=");
    return input.replace(/\s+/g, ''); 
}

function solveSimplex(objFunc, constrArray, optType) {
    let steps = "Función objetivo: " + objFunc + "\n";
    steps += "Restricciones:\n";
    constrArray.forEach((constr, idx) => {
        steps += ` R${idx + 1}: ${constr}\n`;
    });
    steps += `Tipo de optimización: ${optType === "max" ? "Maximizar" : "Minimizar"}\n\n`;

    let simplexTable = createInitialTable(objFunc, constrArray, optType, true);
    steps += "Fase 1 - Tabla inicial del Simplex (con variables artificiales):\n" + printTable(simplexTable) + "\n";

    let iters = 0;
    const maxIters = 100;

    while (!isOptimal(simplexTable)) {
        if (iters >= maxIters) {
            throw new Error("Límite de iteraciones alcanzado. Posible problema de no acotación.");
        }

        const pivotCol = findPivotColumn(simplexTable);
        if (pivotCol === -1) {
            throw new Error("Solución no acotada.");
        }

        const pivotRow = findPivotRow(simplexTable, pivotCol);
        if (pivotRow === -1) {
            throw new Error("No hay solución factible.");
        }

        simplexTable = pivot(simplexTable, pivotRow, pivotCol);
        steps += `Iteración ${iters + 1} (Fase 1):\n` + printTable(simplexTable) + "\n";
        iters++;
    }

    steps += "Fase 1 completada. Variables artificiales eliminadas.\n";
    simplexTable = createInitialTable(objFunc, constrArray, optType, false);
    steps += "Fase 2 - Resolviendo con la función objetivo original:\n" + printTable(simplexTable) + "\n";

    iters = 0;
    while (!isOptimal(simplexTable)) {
        if (iters >= maxIters) {
            throw new Error("Límite de iteraciones alcanzado. Posible problema de no acotación.");
        }

        const pivotCol = findPivotColumn(simplexTable);
        if (pivotCol === -1) {
            throw new Error("Solución no acotada.");
        }

        const pivotRow = findPivotRow(simplexTable, pivotCol);
        if (pivotRow === -1) {
            throw new Error("No hay solución factible.");
        }

        simplexTable = pivot(simplexTable, pivotRow, pivotCol);
        steps += `Iteración ${iters + 1} (Fase 2):\n` + printTable(simplexTable) + "\n";
        iters++;
    }

    const optimalResult = getOptimalResult(simplexTable);
    steps += "\nResultado óptimo:\n" + optimalResult;
    return steps;
}

function createInitialTable(objFunc, constrArray, optType, isPhaseOne) {
    const varCount = getVariableNames(objFunc, constrArray).length; 
    const constrCount = constrArray.length;
    let slackCount = 0; 
    let excessCount = 0; 
    let artificialCount = 0; 

    constrArray.forEach(constr => {
        if (constr.includes("<=")) {
            slackCount++;
        } else if (constr.includes(">=")) {
            excessCount++;
            artificialCount++;
        } else if (constr.includes("=")) {
            artificialCount++;
        }
    });

    let table = Array.from({ length: constrCount + 1 }, () =>
        Array.from({ length: varCount + slackCount + excessCount + artificialCount + 1 }, () => 0)
    );

    let slackIdx = varCount; 
    let excessIdx = varCount + slackCount; 
    let artificialIdx = varCount + slackCount + excessCount; 

    for (let i = 0; i < constrCount; i++) {
        const constr = constrArray[i];
        if (!constr) {
            throw new Error("Restricción no válida en la posición: " + (i + 1));
        }

        const constrLower = constr.toLowerCase();

        let operator;
        if (constr.includes("<=")) {
            operator = "<=";
        } else if (constr.includes(">=")) {
            operator = ">=";
        } else if (constr.includes("=")) {
            operator = "=";
        } else {
            throw new Error("Operador no válido en la restricción en la posición: " + (i + 1));
        }

        const constrParts = constr.split(operator);
        if (constrParts.length < 2) {
            throw new Error("Error al procesar la restricción en la posición: " + (i + 1));
        }

        const leftSide = constrParts[0] ? constrParts[0].trim() : null;
        const rightSide = constrParts[1] ? parseFloat(constrParts[1].trim()) : null;

        if (!leftSide || isNaN(rightSide)) {
            throw new Error("Restricción no válida en la posición: " + (i + 1));
        }

        const varCoefficients = leftSide.match(/[+-]?(\d+(?:\.\d+)?|\b)[a-zA-Z](?:\d+)?/g).map(term => {
            const parts = term.match(/[+-]?(\d+(?:\.\d+)?)?/);
            return parseFloat(parts[0] || 1);
        });

        for (let j = 0; j < varCount; j++) {
            table[i][j] = varCoefficients[j] || 0;
        }

        if (operator === "<=") {
            table[i][slackIdx++] = 1; 
        } else if (operator === ">=") {
            table[i][excessIdx++] = -1; 
            table[i][artificialIdx++] = 1; 
        } else if (operator === "=") {
            table[i][artificialIdx++] = 1; 
        }

        table[i][table[0].length - 1] = rightSide;
    }

    if (isPhaseOne) {
        for (let j = 0; j < artificialCount; j++) {
            table[constrCount][artificialIdx - artificialCount + j] = 1; 
        }
    } else {
        const objCoefficients = objFunc.match(/[+-]?\d*(?:\.\d+)?[a-zA-Z]\d*/g).map(term => {
            const coeffMatch = term.match(/[+-]?\d+(?:\.\d+)?/);
            const coefficient = coeffMatch ? parseFloat(coeffMatch[0]) : 1;
            return optType === "max" ? -coefficient : coefficient;
        });

        for (let j = 0; j < varCount; j++) {
            table[constrCount][j] = objCoefficients[j] || 0;
        }
    }

    return table;
}

function getVariableNames(objFunc, constrArray) {
    const allVars = new Set();

    const objVars = objFunc.match(/[a-zA-Z](?:\d+)?/g) || []; 
    objVars.forEach(varName => allVars.add(varName));

    constrArray.forEach(constr => {
        const constrVars = constr.match(/[a-zA-Z](?:\d+)?/g) || []; 
        constrVars.forEach(varName => allVars.add(varName));
    });

    return Array.from(allVars);
}

function printTable(table) {
    let output = '';
    table.forEach(row => {
        output += row.map(val => val.toFixed(2)).join(' ') + '\n'; 
    });
    return output;
}

function isOptimal(table) {
    const lastRow = table[table.length - 1];
    return lastRow.slice(0, -1).every(val => val >= 0);
}

function findPivotColumn(table) {
    const lastRow = table[table.length - 1];
    let mostNeg = 0;
    let pivotCol = -1;
    for (let i = 0; i < lastRow.length - 1; i++) {
        if (lastRow[i] < mostNeg) {
            mostNeg = lastRow[i];
            pivotCol = i;
        }
    }
    return pivotCol;
}

function findPivotRow(table, pivotCol) {
    let minRatio = Infinity;
    let pivotRow = -1;
    for (let i = 0; i < table.length - 1; i++) {
        const rightHand = table[i][table[i].length - 1];
        const pivotVal = table[i][pivotCol];
        if (pivotVal > 0) {
            const ratio = rightHand / pivotVal;
            if (ratio < minRatio) {
                minRatio = ratio;
                pivotRow = i;
            }
        }
    }
    return pivotRow;
}

function pivot(table, pivotRow, pivotCol) {
    const pivotVal = table[pivotRow][pivotCol];
    const newRow = table[pivotRow].map(val => val / pivotVal); 
    const newTable = table.map(row => [...row]); 

    for (let i = 0; i < newTable.length; i++) {
        if (i !== pivotRow) {
            const factor = newTable[i][pivotCol];
            for (let j = 0; j < newRow.length; j++) {
                newTable[i][j] -= factor * newRow[j];
            }
        }
    }
    newTable[pivotRow] = newRow;
    return newTable;
}

function getOptimalResult(table) {
    const lastRow = table[table.length - 1];
    const variables = lastRow.slice(0, -1);
    const optimalValue = lastRow[lastRow.length - 1];

    let result = `Valor óptimo: ${optimalValue.toFixed(2)}\n`;
    for (let i = 0; i < variables.length; i++) {
        if (variables[i] > 0) {
            result += `Variable ${i + 1}: ${variables[i].toFixed(2)}\n`;
        }
    }
    return result;
}
