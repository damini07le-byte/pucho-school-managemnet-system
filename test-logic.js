// Mock document and window
global.window = {};
global.document = {
    getElementById: function(id) {
        console.log(`[mockDOM] getElementById called for: ${id}`);
        const mockElement = {
            value: '',
            innerText: '',
            classList: {
                remove: (c) => console.log(`[mockDOM] removed class ${c} from ${id}`)
            }
        };
        return mockElement;
    },
    querySelector: function(sel) {
        console.log(`[mockDOM] querySelector called for: ${sel}`);
        return { innerText: '' };
    }
};

const fs = require('fs');

// Load data.js manually to get schoolDB
const dataJs = fs.readFileSync('./public/data.js', 'utf8');
const script = new Function('window', 'document', dataJs + '\nreturn window.schoolDB;');
global.schoolDB = script(global.window, global.document);

// At this point, schoolDB is defined globally
console.log("Loaded schoolDB with " + global.schoolDB.homework.length + " assignments");

// Load the dashboard.js file and extract the editHomework function definition
const dashboardJs = fs.readFileSync('./public/dashboard.js', 'utf8');
const match = dashboardJs.match(/editHomework:\s*function\s*\(\w+\)\s*{([\s\S]*?)},\s*saveExamMarks/);

let editHomeworkBody = match[1];

// Function to simulate window.showToast
global.showToast = (msg, type) => console.log(`[TOAST] ${type}: ${msg}`);

const dashboard = {
    editHomework: new Function('id', 'schoolDB', 'document', 'showToast', editHomeworkBody)
};

console.log("--- Executing editHomework for HW-101 ---");
dashboard.editHomework.call(dashboard, 'HW-101', global.schoolDB, global.document, global.showToast);
console.log("--- Done ---");
