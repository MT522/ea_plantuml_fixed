/**
 * PlantUML to Enterprise Architect Converter
 * 
 * This script reads PlantUML code from a selected note element in an EA diagram
 * and converts it into actual EA UML elements (packages, classes, interfaces, relationships)
 * 
 * Usage:
 * 1. Create a note element in your EA diagram
 * 2. Add your PlantUML code to the note's text
 * 3. Select the note element
 * 4. Run this script from the EA Script Manager
 */

!INC Local Scripts.EAConstants-JScript

// Main function
function main() {
    // Get the currently selected object (should be a note)
    var selectedObject = Repository.GetContextObject();
    
    if (selectedObject == null) {
        Session.Output("ERROR: No object selected. Please select a note element containing PlantUML code.");
        return;
    }
    
    // Check if selected object is a note
    if (selectedObject.Type != "Note" && selectedObject.Type != "Text") {
        Session.Output("ERROR: Selected object is not a note. Please select a note element.");
        Session.Output("Selected type: " + selectedObject.Type);
        return;
    }
    
    // Get the diagram where the note is placed
    var diagram = Repository.GetCurrentDiagram();
    if (diagram == null) {
        Session.Output("ERROR: No diagram is currently open.");
        return;
    }
    
    // Get PlantUML content from note
    var plantumlCode = selectedObject.Notes;
    
    if (plantumlCode == null || plantumlCode == "") {
        Session.Output("ERROR: The selected note is empty. Please add PlantUML code to the note.");
        return;
    }
    
    Session.Output("========================================");
    Session.Output("PlantUML to EA Converter");
    Session.Output("========================================");
    Session.Output("Source: " + selectedObject.Name);
    Session.Output("Diagram: " + diagram.Name);
    Session.Output("Package: " + diagram.PackageID);
    Session.Output("");
    
    // Parse and convert PlantUML
    try {
        var parser = new PlantUMLParser(plantumlCode, diagram);
        parser.parse();
        Session.Output("");
        Session.Output("========================================");
        Session.Output("Conversion completed successfully!");
        Session.Output("========================================");
        
        // Refresh the diagram
        diagram.Update();
        Repository.ReloadDiagram(diagram.DiagramID);
        
    } catch (e) {
        Session.Output("ERROR: " + e.message);
        Session.Output("Stack: " + e.stack);
    }
}

/**
 * PlantUML Parser Class
 */
function PlantUMLParser(code, diagram) {
    this.code = code;
    this.diagram = diagram;
    this.lines = [];
    this.packages = {};  // packageName -> Package object
    this.classes = {};   // className -> Element object
    this.interfaces = {}; // interfaceName -> Element object
    this.currentPackage = null;
    this.relationships = [];
    this.posX = 100;
    this.posY = 100;
    this.spacing = 150;
    this.packageCount = 0;
    
    // Get the package where we'll create elements
    this.targetPackage = Repository.GetPackageByID(diagram.PackageID);
}

PlantUMLParser.prototype.parse = function() {
    // Split into lines and clean
    this.lines = this.code.split('\n');
    
    Session.Output("Parsing PlantUML code...");
    Session.Output("Total lines: " + this.lines.length);
    Session.Output("");
    
    // First pass: Create packages, classes, and interfaces
    for (var i = 0; i < this.lines.length; i++) {
        var line = this.lines[i].trim();
        
        // Skip empty lines and comments
        if (line == "" || line.indexOf("'") == 0 || line.indexOf("@startuml") == 0 || 
            line.indexOf("@enduml") == 0 || line.indexOf("!theme") == 0) {
            continue;
        }
        
        this.parseLine(line, i);
    }
    
    // Second pass: Create relationships
    Session.Output("");
    Session.Output("Creating relationships...");
    for (var i = 0; i < this.relationships.length; i++) {
        this.createRelationship(this.relationships[i]);
    }
    
    Session.Output("");
    Session.Output("Summary:");
    Session.Output("- Packages created: " + Object.keys(this.packages).length);
    Session.Output("- Classes created: " + Object.keys(this.classes).length);
    Session.Output("- Interfaces created: " + Object.keys(this.interfaces).length);
    Session.Output("- Relationships created: " + this.relationships.length);
};

PlantUMLParser.prototype.parseLine = function(line, lineNum) {
    // Handle package
    if (line.indexOf("package") == 0) {
        this.parsePackage(line);
    }
    // Handle closing brace (exit package)
    else if (line == "}") {
        this.currentPackage = null;
    }
    // Handle class
    else if (line.indexOf("class ") == 0 || line.indexOf("abstract class ") == 0) {
        this.parseClass(line);
    }
    // Handle interface
    else if (line.indexOf("interface ") == 0) {
        this.parseInterface(line);
    }
    // Handle attributes (lines starting with -)
    else if (line.indexOf("-") == 0 || line.indexOf("+") == 0 || line.indexOf("#") == 0) {
        this.parseAttribute(line);
    }
    // Handle relationships
    else if (line.indexOf("-->") > 0 || line.indexOf("->") > 0 || 
             line.indexOf(".>") > 0 || line.indexOf(".|>") > 0 ||
             line.indexOf("implements") > 0 || line.indexOf("extends") > 0) {
        this.parseRelationship(line);
    }
};

PlantUMLParser.prototype.parsePackage = function(line) {
    // Extract package name
    // Format: package "Name" { or package "Name" as Alias {
    var match = line.match(/package\s+"([^"]+)"/);
    if (!match) {
        match = line.match(/package\s+(\w+)/);
    }
    
    if (match) {
        var packageName = match[1];
        
        // Check for alias
        var aliasMatch = line.match(/as\s+(\w+)/);
        var alias = aliasMatch ? aliasMatch[1] : packageName;
        
        Session.Output("Creating package: " + packageName);
        
        // Create package in EA
        var pkg = this.targetPackage.Packages.AddNew(packageName, "Package");
        pkg.Update();
        this.packages[alias] = pkg;
        this.packages[packageName] = pkg;
        this.currentPackage = pkg;
        this.packageCount++;
    }
};

PlantUMLParser.prototype.parseClass = function(line) {
    // Extract class name and check for abstract
    var isAbstract = line.indexOf("abstract class") == 0;
    var pattern = isAbstract ? /abstract\s+class\s+(\w+)/ : /class\s+(\w+)/;
    var match = line.match(pattern);
    
    if (match) {
        var className = match[1];
        
        // Check if class extends or implements
        var extendsMatch = line.match(/extends\s+(\w+)/);
        var implementsMatch = line.match(/implements\s+(\w+)/);
        
        Session.Output("Creating class: " + className + 
                      (isAbstract ? " (abstract)" : "") +
                      (extendsMatch ? " extends " + extendsMatch[1] : "") +
                      (implementsMatch ? " implements " + implementsMatch[1] : ""));
        
        // Determine which package to create in
        var targetPkg = this.currentPackage ? this.currentPackage : this.targetPackage;
        
        // Create class in EA
        var element = targetPkg.Elements.AddNew(className, "Class");
        element.Abstract = isAbstract ? "1" : "0";
        element.Update();
        
        // Store for later reference
        this.classes[className] = element;
        
        // Add to diagram
        this.addElementToDiagram(element);
        
        // Handle extends/implements as relationships
        if (extendsMatch) {
            this.relationships.push({
                type: "Generalization",
                source: className,
                target: extendsMatch[1],
                label: ""
            });
        }
        
        if (implementsMatch) {
            this.relationships.push({
                type: "Realization",
                source: className,
                target: implementsMatch[1],
                label: ""
            });
        }
    }
};

PlantUMLParser.prototype.parseInterface = function(line) {
    // Extract interface name
    var match = line.match(/interface\s+(\w+)/);
    
    if (match) {
        var interfaceName = match[1];
        
        Session.Output("Creating interface: " + interfaceName);
        
        // Determine which package to create in
        var targetPkg = this.currentPackage ? this.currentPackage : this.targetPackage;
        
        // Create interface in EA
        var element = targetPkg.Elements.AddNew(interfaceName, "Interface");
        element.Update();
        
        // Store for later reference
        this.interfaces[interfaceName] = element;
        this.classes[interfaceName] = element; // Also add to classes for relationship lookup
        
        // Add to diagram
        this.addElementToDiagram(element);
    }
};

PlantUMLParser.prototype.parseAttribute = function(line) {
    // Parse attribute or method
    // Format: -attributeName: type or +methodName(param: type): returnType
    
    // Determine visibility
    var visibility = "Private";
    if (line.indexOf("+") == 0) visibility = "Public";
    else if (line.indexOf("#") == 0) visibility = "Protected";
    else if (line.indexOf("~") == 0) visibility = "Package";
    
    // Remove visibility marker
    line = line.substring(1).trim();
    
    // Check if it's a method (contains parentheses)
    var isMethod = line.indexOf("(") > 0;
    
    if (!this.currentClass) {
        // Need to track current class being parsed
        return;
    }
    
    if (isMethod) {
        this.parseMethod(line, visibility);
    } else {
        this.parseAttributeDetails(line, visibility);
    }
};

PlantUMLParser.prototype.parseAttributeDetails = function(line, visibility) {
    // Parse attribute: name: type
    var match = line.match(/(\w+)\s*:\s*([^\s]+)/);
    
    if (match && this.currentClass) {
        var attrName = match[1];
        var attrType = match[2];
        
        var attr = this.currentClass.Attributes.AddNew(attrName, attrType);
        attr.Visibility = visibility;
        attr.Update();
    }
};

PlantUMLParser.prototype.parseMethod = function(line, visibility) {
    // Parse method: name(params): returnType
    var match = line.match(/(\w+)\s*\(([^)]*)\)\s*:\s*(\w+)/);
    
    if (match && this.currentClass) {
        var methodName = match[1];
        var params = match[2];
        var returnType = match[3];
        
        var method = this.currentClass.Methods.AddNew(methodName, returnType);
        method.Visibility = visibility;
        method.Update();
        
        // Parse parameters
        if (params && params.trim() != "") {
            var paramList = params.split(",");
            for (var i = 0; i < paramList.length; i++) {
                var paramStr = paramList[i].trim();
                var paramMatch = paramStr.match(/(\w+)\s*:\s*(\w+)/);
                if (paramMatch) {
                    var param = method.Parameters.AddNew(paramMatch[1], paramMatch[2]);
                    param.Update();
                }
            }
        }
        
        method.Update();
    }
};

PlantUMLParser.prototype.parseRelationship = function(line) {
    // Parse various relationship types
    var relType = "";
    var source = "";
    var target = "";
    var label = "";
    
    // Implements (realization)
    if (line.indexOf("implements") > 0) {
        var match = line.match(/(\w+)\s+implements\s+(\w+)/);
        if (match) {
            relType = "Realization";
            source = match[1];
            target = match[2];
        }
    }
    // Extends (generalization)
    else if (line.indexOf("extends") > 0) {
        var match = line.match(/(\w+)\s+extends\s+(\w+)/);
        if (match) {
            relType = "Generalization";
            source = match[1];
            target = match[2];
        }
    }
    // Dependency (dashed arrow)
    else if (line.indexOf(".>") > 0 || line.indexOf("..>") > 0) {
        var parts = line.split(/\.+>/);
        if (parts.length >= 2) {
            relType = "Dependency";
            source = parts[0].trim();
            target = parts[1].split(":")[0].trim();
            
            // Extract label if present
            var labelMatch = line.match(/:\s*<<([^>]+)>>/);
            if (labelMatch) label = labelMatch[1];
        }
    }
    // Realization (dashed arrow with triangle)
    else if (line.indexOf(".|>") > 0) {
        var parts = line.split(/\.\|>/);
        if (parts.length >= 2) {
            relType = "Realization";
            source = parts[0].trim();
            target = parts[1].split(":")[0].trim();
        }
    }
    // Association (solid arrow)
    else if (line.indexOf("-->") > 0) {
        var parts = line.split(/-->/);
        if (parts.length >= 2) {
            relType = "Association";
            source = parts[0].trim();
            target = parts[1].split(":")[0].trim();
            
            // Extract label if present
            var labelMatch = line.match(/:\s*<<([^>]+)>>/);
            if (labelMatch) label = labelMatch[1];
        }
    }
    // Aggregation or other
    else if (line.indexOf("->") > 0) {
        var parts = line.split(/->/);
        if (parts.length >= 2) {
            relType = "Association";
            source = parts[0].trim();
            target = parts[1].split(":")[0].trim();
        }
    }
    
    if (relType && source && target) {
        this.relationships.push({
            type: relType,
            source: source,
            target: target,
            label: label
        });
    }
};

PlantUMLParser.prototype.createRelationship = function(rel) {
    // Find source and target elements
    var sourceElement = this.classes[rel.source];
    var targetElement = this.classes[rel.target];
    
    if (!sourceElement) {
        Session.Output("Warning: Source element not found: " + rel.source);
        return;
    }
    
    if (!targetElement) {
        Session.Output("Warning: Target element not found: " + rel.target);
        return;
    }
    
    Session.Output("Creating " + rel.type + ": " + rel.source + " -> " + rel.target);
    
    // Create connector
    var connector = sourceElement.Connectors.AddNew("", rel.type);
    connector.SupplierID = targetElement.ElementID;
    
    if (rel.label) {
        connector.Name = rel.label;
    }
    
    connector.Update();
    
    // Add connector to diagram
    var diagramConnector = this.diagram.DiagramLinks.AddNew("", "");
    diagramConnector.ConnectorID = connector.ConnectorID;
    diagramConnector.Update();
};

PlantUMLParser.prototype.addElementToDiagram = function(element) {
    // Add element to diagram with positioning
    var diagramObject = this.diagram.DiagramObjects.AddNew("l=" + this.posX + ";t=" + this.posY + ";r=" + (this.posX + 120) + ";b=" + (this.posY + 80) + ";", "");
    diagramObject.ElementID = element.ElementID;
    diagramObject.Update();
    
    // Update position for next element
    this.posX += this.spacing;
    if (this.posX > 800) {
        this.posX = 100;
        this.posY += 150;
    }
};

/**
 * Helper function to find element by name in package
 */
function findElementByName(pkg, name) {
    for (var i = 0; i < pkg.Elements.Count; i++) {
        var element = pkg.Elements.GetAt(i);
        if (element.Name == name) {
            return element;
        }
    }
    return null;
}

// Run the main function
main();

