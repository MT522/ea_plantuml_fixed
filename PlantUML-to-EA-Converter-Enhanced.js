/**
 * PlantUML to Enterprise Architect Converter - Enhanced Version
 * 
 * This enhanced script reads PlantUML code from a selected note element and converts it 
 * into actual EA UML elements with better support for:
 * - Classes with attributes and methods
 * - Interfaces
 * - Packages (nested)
 * - Multiple relationship types
 * - Stereotypes
 * - Visibility modifiers
 * - Array types
 * 
 * Usage:
 * 1. Create a note element in your EA diagram
 * 2. Add your PlantUML code to the note's text
 * 3. Select the note element
 * 4. Run this script from EA Script Manager (Tools -> Scripting -> Script Management)
 */

!INC Local Scripts.EAConstants-JScript

// Main function
function main() {
    Session.Output("========================================");
    Session.Output("PlantUML to EA Converter - Enhanced");
    Session.Output("========================================");
    
    // Get the currently selected object (should be a note)
    var selectedObject = Repository.GetContextObject();
    
    if (selectedObject == null) {
        Session.Output("ERROR: No object selected.");
        Session.Output("Please select a note element containing PlantUML code.");
        return;
    }
    
    // Check if selected object is a note
    if (selectedObject.Type != "Note" && selectedObject.Type != "Text") {
        Session.Output("ERROR: Selected object is not a note.");
        Session.Output("Selected type: " + selectedObject.Type);
        Session.Output("Please select a note element containing PlantUML code.");
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
        Session.Output("ERROR: The selected note is empty.");
        Session.Output("Please add PlantUML code to the note.");
        return;
    }
    
    Session.Output("Source Note: " + selectedObject.Name);
    Session.Output("Target Diagram: " + diagram.Name);
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
        Session.Output("");
        Session.Output("========================================");
        Session.Output("ERROR: " + e.message);
        if (e.stack) {
            Session.Output("Stack: " + e.stack);
        }
        Session.Output("========================================");
    }
}

/**
 * PlantUML Parser Class with enhanced features
 */
function PlantUMLParser(code, diagram) {
    this.code = code;
    this.diagram = diagram;
    this.lines = [];
    this.packages = {};  // packageName -> Package object
    this.packageComponents = {};  // packageName -> Component element
    this.elements = {};  // elementName -> Element object
    this.elementPositions = {};  // elementName -> {x, y, width, height}
    this.componentPositions = {};  // componentName -> {x, y, width, height}
    this.elementPackageMap = {};  // elementName -> packageName
    this.currentPackageName = null;  // Just the name, not nested
    this.currentElement = null;
    this.packageDepth = 0;  // Track nesting level
    this.relationships = [];
    
    // Layout configuration
    this.layout = {
        startX: 100,
        startY: 100,
        componentSpacingX: 600,
        componentSpacingY: 100,
        componentPadding: 80,
        componentHeaderHeight: 60,
        classSpacingX: 30,
        classSpacingY: 40,
        classWidth: 180,
        classHeight: 120,
        interfaceWidth: 160,
        interfaceHeight: 100,
        margin: 20
    };
    
    this.diagramObjects = {};  // Store diagram objects for later adjustment
    
    // Get the package where we'll create elements
    this.targetPackage = Repository.GetPackageByID(diagram.PackageID);
    
    // Statistics
    this.stats = {
        packages: 0,
        components: 0,
        classes: 0,
        interfaces: 0,
        attributes: 0,
        methods: 0,
        relationships: 0
    };
}

PlantUMLParser.prototype.parse = function() {
    Session.Output("Parsing PlantUML code...");
    Session.Output("Total lines: " + this.code.split('\n').length);
    Session.Output("");
    
    // Split into lines and clean
    this.lines = this.code.split('\n');
    
    // First pass: Create packages, classes, and interfaces
    Session.Output("Phase 1: Creating elements...");
    Session.Output("");
    
    for (var i = 0; i < this.lines.length; i++) {
        var line = this.lines[i].trim();
        
        // Skip empty lines and comments
        if (this.shouldSkipLine(line)) {
            continue;
        }
        
        this.parseLine(line, i);
    }
    
    // Phase 2: Calculate optimal layout
    Session.Output("");
    Session.Output("Phase 2: Calculating optimal layout...");
    Session.Output("");
    this.calculateSmartLayout();
    
    // Phase 3: Position elements on diagram
    Session.Output("Phase 3: Positioning elements...");
    Session.Output("");
    this.applyLayoutToElements();
    
    // Phase 4: Create relationships
    Session.Output("");
    Session.Output("Phase 4: Creating relationships...");
    Session.Output("");
    
    for (var i = 0; i < this.relationships.length; i++) {
        this.createRelationship(this.relationships[i]);
    }
    
    // Print summary
    this.printSummary();
};

PlantUMLParser.prototype.shouldSkipLine = function(line) {
    return line == "" || 
           line.indexOf("'") == 0 || 
           line.indexOf("@startuml") == 0 || 
           line.indexOf("@enduml") == 0 || 
           line.indexOf("!theme") == 0 ||
           line.indexOf("!define") == 0 ||
           line.indexOf("!include") == 0;
};

PlantUMLParser.prototype.parseLine = function(line, lineNum) {
    // Handle package
    if (line.indexOf("package ") == 0) {
        this.parsePackage(line);
    }
    // Handle closing brace
    else if (line == "}") {
        if (this.currentElement) {
            // Exiting a class/interface body
            this.currentElement = null;
        } else if (this.packageDepth > 0) {
            // Exiting a package
            this.packageDepth--;
            if (this.packageDepth == 0) {
                this.currentPackageName = null;
            }
        }
    }
    // Handle opening brace (after class/interface declaration on separate line)
    else if (line == "{") {
        // Already handled in class/interface parsing
    }
    // Handle abstract class
    else if (line.indexOf("abstract class ") == 0 || line.indexOf("abstract ") == 0) {
        this.parseClass(line, true);
    }
    // Handle class
    else if (line.indexOf("class ") == 0) {
        this.parseClass(line, false);
    }
    // Handle interface
    else if (line.indexOf("interface ") == 0) {
        this.parseInterface(line);
    }
    // Handle attributes and methods (when inside a class/interface)
    else if (this.currentElement && (line.indexOf("-") == 0 || line.indexOf("+") == 0 || 
                                      line.indexOf("#") == 0 || line.indexOf("~") == 0)) {
        this.parseClassMember(line);
    }
    // Handle relationships
    else if (this.isRelationshipLine(line)) {
        this.parseRelationship(line);
    }
};

PlantUMLParser.prototype.isRelationshipLine = function(line) {
    return line.indexOf("-->") > 0 || 
           line.indexOf("->") > 0 || 
           line.indexOf(".>") > 0 || 
           line.indexOf("..>") > 0 ||
           line.indexOf(".|>") > 0 ||
           line.indexOf("..|>") > 0 ||
           line.indexOf("<|--") > 0 ||
           line.indexOf("*--") > 0 ||
           line.indexOf("o--") > 0 ||
           (line.indexOf("implements ") > 0 && line.indexOf("class ") >= 0) ||
           (line.indexOf("extends ") > 0 && line.indexOf("class ") >= 0);
};

PlantUMLParser.prototype.parsePackage = function(line) {
    // Format: package "Name" { or package "Name" as Alias { or package Name {
    var packageName = "";
    var alias = "";
    
    // Try quoted name first
    var match = line.match(/package\s+"([^"]+)"/);
    if (match) {
        packageName = match[1];
    } else {
        // Try unquoted name
        match = line.match(/package\s+(\w+)/);
        if (match) {
            packageName = match[1];
        }
    }
    
    // Check for alias
    var aliasMatch = line.match(/as\s+(\w+)/);
    alias = aliasMatch ? aliasMatch[1] : packageName;
    
    if (packageName) {
        Session.Output("Creating package: " + packageName + (alias != packageName ? " (alias: " + alias + ")" : ""));
        
        // Create package in EA (all packages at same level, not nested)
        var pkg = this.targetPackage.Packages.AddNew(packageName, "Package");
        pkg.Update();
        
        // Create a Component element for this package in the diagram
        var componentElement = this.targetPackage.Elements.AddNew(packageName, "Component");
        componentElement.Update();
        
        Session.Output("  -> Created Component element for package: " + packageName);
        
        // Store package and component references
        this.packages[alias] = pkg;
        this.packages[packageName] = pkg;
        this.packageComponents[packageName] = componentElement;
        this.packageComponents[alias] = componentElement;
        
        // Set as current package (not nested)
        this.currentPackageName = packageName;
        this.packageDepth++;
        
        this.stats.packages++;
        this.stats.components++;
    }
};

PlantUMLParser.prototype.parseClass = function(line, isAbstract) {
    // Extract class name
    var className = "";
    var stereotype = "";
    var implementsInterface = null;
    var extendsClass = null;
    
    // Check for stereotype in class name
    var stereoMatch = line.match(/class\s+(\w+)\s*<<([^>]+)>>/);
    if (stereoMatch) {
        className = stereoMatch[1];
        stereotype = stereoMatch[2];
    } else {
        var match = line.match(/class\s+(\w+)/);
        if (!match && isAbstract) {
            match = line.match(/abstract\s+class\s+(\w+)/);
        }
        if (match) {
            className = match[1];
        }
    }
    
    // Check for implements
    var implementsMatch = line.match(/implements\s+(\w+)/);
    if (implementsMatch) {
        implementsInterface = implementsMatch[1];
    }
    
    // Check for extends
    var extendsMatch = line.match(/extends\s+(\w+)/);
    if (extendsMatch) {
        extendsClass = extendsMatch[1];
    }
    
    if (className) {
        var pkgInfo = this.currentPackageName ? " in package '" + this.currentPackageName + "'" : "";
        Session.Output("Creating class: " + className + 
                      (isAbstract ? " (abstract)" : "") +
                      (stereotype ? " <<" + stereotype + ">>" : "") + 
                      pkgInfo);
        
        // Determine target package - get actual Package object for the current package
        var targetPkg = this.currentPackageName ? this.packages[this.currentPackageName] : this.targetPackage;
        
        // Create class in EA
        var element = targetPkg.Elements.AddNew(className, "Class");
        element.Abstract = isAbstract ? "1" : "0";
        
        if (stereotype) {
            element.StereotypeEx = stereotype;
        }
        
        element.Update();
        
        // Store element reference
        this.elements[className] = element;
        
        // Track package membership
        if (this.currentPackageName) {
            this.elementPackageMap[className] = this.currentPackageName;
        }
        
        // Set as current element if line contains opening brace or no brace at all
        if (line.indexOf("{") > 0 || line.indexOf("{") < 0) {
            this.currentElement = element;
        }
        
        this.stats.classes++;
        
        // Handle relationships
        if (implementsInterface) {
            this.relationships.push({
                type: "Realization",
                source: className,
                target: implementsInterface,
                label: ""
            });
        }
        
        if (extendsClass) {
            this.relationships.push({
                type: "Generalization",
                source: className,
                target: extendsClass,
                label: ""
            });
        }
    }
};

PlantUMLParser.prototype.parseInterface = function(line) {
    // Extract interface name
    var interfaceName = "";
    
    var match = line.match(/interface\s+(\w+)/);
    if (match) {
        interfaceName = match[1];
    }
    
    if (interfaceName) {
        var pkgInfo = this.currentPackageName ? " in package '" + this.currentPackageName + "'" : "";
        Session.Output("Creating interface: " + interfaceName + pkgInfo);
        
        // Determine target package
        var targetPkg = this.currentPackageName ? this.packages[this.currentPackageName] : this.targetPackage;
        
        // Create interface in EA
        var element = targetPkg.Elements.AddNew(interfaceName, "Interface");
        element.Update();
        
        // Store element reference
        this.elements[interfaceName] = element;
        
        // Track package membership
        if (this.currentPackageName) {
            this.elementPackageMap[interfaceName] = this.currentPackageName;
        }
        
        // Set as current element
        if (line.indexOf("{") > 0 || line.indexOf("{") < 0) {
            this.currentElement = element;
        }
        
        this.stats.interfaces++;
    }
};

PlantUMLParser.prototype.parseClassMember = function(line) {
    if (!this.currentElement) {
        return;
    }
    
    // Determine visibility
    var visibility = "Private";
    if (line.indexOf("+") == 0) visibility = "Public";
    else if (line.indexOf("#") == 0) visibility = "Protected";
    else if (line.indexOf("~") == 0) visibility = "Package";
    else if (line.indexOf("-") == 0) visibility = "Private";
    
    // Remove visibility marker
    line = line.substring(1).trim();
    
    // Check if it's a method (contains parentheses)
    var isMethod = line.indexOf("(") >= 0;
    
    if (isMethod) {
        this.parseMethod(line, visibility);
    } else {
        this.parseAttribute(line, visibility);
    }
};

PlantUMLParser.prototype.parseAttribute = function(line, visibility) {
    // Parse attribute: name: type or name : type[] 
    var match = line.match(/(\w+)\s*:\s*([^\s]+)/);
    
    if (match) {
        var attrName = match[1];
        var attrType = match[2];
        
        var attr = this.currentElement.Attributes.AddNew(attrName, attrType);
        attr.Visibility = visibility;
        attr.Update();
        
        this.stats.attributes++;
    }
};

PlantUMLParser.prototype.parseMethod = function(line, visibility) {
    // Parse method: name(params): returnType
    // Handle both: methodName(param: type): returnType and methodName(): returnType
    
    var methodName = "";
    var returnType = "void";
    var params = "";
    
    // Extract method name, parameters, and return type
    var match = line.match(/(\w+)\s*\(([^)]*)\)\s*:\s*(\w+)/);
    if (!match) {
        // Try without return type
        match = line.match(/(\w+)\s*\(([^)]*)\)/);
        if (match) {
            methodName = match[1];
            params = match[2];
            returnType = "void";
        }
    } else {
        methodName = match[1];
        params = match[2];
        returnType = match[3];
    }
    
    if (methodName) {
        var method = this.currentElement.Methods.AddNew(methodName, returnType);
        method.Visibility = visibility;
        method.Update();
        
        // Parse parameters
        if (params && params.trim() != "") {
            var paramList = params.split(",");
            for (var i = 0; i < paramList.length; i++) {
                var paramStr = paramList[i].trim();
                var paramMatch = paramStr.match(/(\w+)\s*:\s*([^\s,]+)/);
                if (paramMatch) {
                    var param = method.Parameters.AddNew(paramMatch[1], paramMatch[2]);
                    param.Update();
                }
            }
        }
        
        method.Update();
        this.stats.methods++;
    }
};

PlantUMLParser.prototype.parseRelationship = function(line) {
    var relType = "";
    var source = "";
    var target = "";
    var label = "";
    
    // Store the relationship for later processing
    // Various PlantUML relationship syntaxes:
    // ClassA --> ClassB : label
    // ClassA .> ClassB : <<stereotype>>
    // ClassA --|> ClassB (inheritance)
    // ClassA ..|> ClassB (realization)
    
    // Generalization (inheritance) <|-- or --|>
    if (line.indexOf("<|--") > 0 || line.indexOf("--|>") > 0) {
        var parts = line.split(/<\|--/);
        if (parts.length < 2) parts = line.split(/--\|>/);
        
        if (parts.length >= 2) {
            relType = "Generalization";
            target = parts[0].trim();
            source = parts[1].split(":")[0].trim();
        }
    }
    // Realization ..|> or .|>
    else if (line.indexOf("..|>") > 0 || line.indexOf(".|>") > 0) {
        var parts = line.split(/\.\.\|>/);
        if (parts.length < 2) parts = line.split(/\.\|>/);
        
        if (parts.length >= 2) {
            relType = "Realization";
            source = parts[0].trim();
            target = parts[1].split(":")[0].trim();
        }
    }
    // Dependency ..> or .>
    else if (line.indexOf("..>") > 0 || line.indexOf(".>") > 0) {
        var parts = line.split(/\.\.>/);
        if (parts.length < 2) parts = line.split(/\.>/);
        
        if (parts.length >= 2) {
            relType = "Dependency";
            source = parts[0].trim();
            target = parts[1].split(":")[0].trim();
            
            // Extract label
            var labelMatch = line.match(/:\s*<<([^>]+)>>/);
            if (!labelMatch) labelMatch = line.match(/:\s*([^\n]+)/);
            if (labelMatch) label = labelMatch[1].trim();
        }
    }
    // Composition *--
    else if (line.indexOf("*--") > 0) {
        var parts = line.split(/\*--/);
        if (parts.length >= 2) {
            relType = "Aggregation";
            source = parts[0].trim();
            target = parts[1].split(":")[0].trim();
            label = "composite";
        }
    }
    // Aggregation o--
    else if (line.indexOf("o--") > 0) {
        var parts = line.split(/o--/);
        if (parts.length >= 2) {
            relType = "Aggregation";
            source = parts[0].trim();
            target = parts[1].split(":")[0].trim();
        }
    }
    // Association -->
    else if (line.indexOf("-->") > 0) {
        var parts = line.split(/-->/);
        if (parts.length >= 2) {
            relType = "Association";
            source = parts[0].trim();
            target = parts[1].split(":")[0].trim();
            
            // Extract label
            var labelMatch = line.match(/:\s*<<([^>]+)>>/);
            if (!labelMatch) labelMatch = line.match(/:\s*([^\n]+)/);
            if (labelMatch) label = labelMatch[1].trim();
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
    var sourceElement = this.elements[rel.source];
    var targetElement = this.elements[rel.target];
    
    if (!sourceElement) {
        Session.Output("Warning: Source element not found for relationship: " + rel.source);
        return;
    }
    
    if (!targetElement) {
        Session.Output("Warning: Target element not found for relationship: " + rel.target);
        return;
    }
    
    Session.Output("Creating " + rel.type + ": " + rel.source + " -> " + rel.target +
                  (rel.label ? " (" + rel.label + ")" : ""));
    
    // Create connector
    var connector = sourceElement.Connectors.AddNew(rel.label, rel.type);
    connector.SupplierID = targetElement.ElementID;
    connector.Update();
    
    // Add connector to diagram
    var diagramConnector = this.diagram.DiagramLinks.AddNew("", "");
    diagramConnector.ConnectorID = connector.ConnectorID;
    diagramConnector.Update();
    
    this.stats.relationships++;
};

/**
 * Calculate smart layout for all elements
 * Creates components for packages and positions classes inside them
 */
PlantUMLParser.prototype.calculateSmartLayout = function() {
    // Group elements by package
    var packageGroups = {};
    var noPackageElements = [];
    
    for (var name in this.elements) {
        var pkg = this.elementPackageMap[name];
        if (pkg) {
            if (!packageGroups[pkg]) {
                packageGroups[pkg] = [];
            }
            packageGroups[pkg].push(name);
        } else {
            noPackageElements.push(name);
        }
    }
    
    // Calculate layout for each package component
    var currentX = this.layout.startX;
    var currentY = this.layout.startY;
    var packageIndex = 0;
    var packagesPerRow = 3;
    var maxRowHeight = 0;
    
    // Process each package
    for (var pkgName in packageGroups) {
        var elements = packageGroups[pkgName];
        
        Session.Output("Calculating layout for package: " + pkgName + " (" + elements.length + " elements)");
        
        // Separate interfaces and classes
        var interfaces = [];
        var classes = [];
        
        for (var i = 0; i < elements.length; i++) {
            var element = this.elements[elements[i]];
            if (element.Type == "Interface") {
                interfaces.push(elements[i]);
            } else {
                classes.push(elements[i]);
            }
        }
        
        // Calculate component size needed for all elements
        var elementsPerRow = Math.min(Math.ceil(Math.sqrt(elements.length)), 3);
        var contentWidth = 0;
        var contentHeight = 0;
        
        // Position interfaces first (at top of component)
        var elemX = currentX + this.layout.componentPadding;
        var elemY = currentY + this.layout.componentHeaderHeight + this.layout.classSpacingY;
        var rowStartY = elemY;
        var elementIndex = 0;
        var maxRowWidth = 0;
        
        for (var i = 0; i < interfaces.length; i++) {
            var name = interfaces[i];
            var element = this.elements[name];
            
            var width = this.calculateElementWidth(element);
            var height = this.calculateElementHeight(element);
            
            this.elementPositions[name] = {
                x: elemX,
                y: elemY,
                width: width,
                height: height,
                package: pkgName
            };
            
            elemX += width + this.layout.classSpacingX;
            elementIndex++;
            maxRowWidth = Math.max(maxRowWidth, elemX - currentX - this.layout.componentPadding);
            
            if (elementIndex % elementsPerRow == 0) {
                elemY += height + this.layout.classSpacingY;
                elemX = currentX + this.layout.componentPadding;
            }
        }
        
        // Position classes below interfaces
        if (interfaces.length > 0) {
            elemY += this.layout.interfaceHeight + this.layout.classSpacingY;
            elemX = currentX + this.layout.componentPadding;
            elementIndex = 0;
        }
        
        for (var i = 0; i < classes.length; i++) {
            var name = classes[i];
            var element = this.elements[name];
            
            var width = this.calculateElementWidth(element);
            var height = this.calculateElementHeight(element);
            
            this.elementPositions[name] = {
                x: elemX,
                y: elemY,
                width: width,
                height: height,
                package: pkgName
            };
            
            elemX += width + this.layout.classSpacingX;
            elementIndex++;
            maxRowWidth = Math.max(maxRowWidth, elemX - currentX - this.layout.componentPadding);
            
            if (elementIndex % elementsPerRow == 0) {
                elemY += height + this.layout.classSpacingY;
                elemX = currentX + this.layout.componentPadding;
            } else if (i == classes.length - 1) {
                // Last element
                elemY += height;
            }
        }
        
        // Calculate component dimensions
        contentWidth = maxRowWidth + (this.layout.componentPadding * 2);
        contentHeight = elemY - currentY + this.layout.componentPadding;
        
        // Ensure minimum component size
        contentWidth = Math.max(contentWidth, 400);
        contentHeight = Math.max(contentHeight, 300);
        
        // Store component position
        this.componentPositions[pkgName] = {
            x: currentX,
            y: currentY,
            width: contentWidth,
            height: contentHeight
        };
        
        // Update maxRowHeight
        maxRowHeight = Math.max(maxRowHeight, contentHeight);
        
        // Move to next component position
        currentX += contentWidth + this.layout.componentSpacingX;
        packageIndex++;
        
        // Start new row after certain number of packages
        if (packageIndex % packagesPerRow == 0) {
            currentX = this.layout.startX;
            currentY += maxRowHeight + this.layout.componentSpacingY;
            maxRowHeight = 0;
        }
    }
    
    // Position elements without package
    if (noPackageElements.length > 0) {
        Session.Output("Positioning elements without package: " + noPackageElements.length);
        
        // Start new row if needed
        if (packageIndex % packagesPerRow != 0) {
            currentX = this.layout.startX;
            currentY += maxRowHeight + this.layout.componentSpacingY;
        }
        
        var elemX = currentX;
        var elemY = currentY;
        var elementIndex = 0;
        var elementsPerRow = 4;
        
        for (var i = 0; i < noPackageElements.length; i++) {
            var name = noPackageElements[i];
            var element = this.elements[name];
            
            var width = this.calculateElementWidth(element);
            var height = this.calculateElementHeight(element);
            
            this.elementPositions[name] = {
                x: elemX,
                y: elemY,
                width: width,
                height: height
            };
            
            elemX += width + this.layout.classSpacingX;
            elementIndex++;
            
            if (elementIndex % elementsPerRow == 0) {
                elemY += height + this.layout.classSpacingY;
                elemX = currentX;
            }
        }
    }
    
    // Apply hierarchical adjustments based on relationships
    this.adjustLayoutForRelationships();
};

/**
 * Calculate element width based on content
 */
PlantUMLParser.prototype.calculateElementWidth = function(element) {
    if (element.Type == "Interface") {
        // Interfaces are typically narrower
        var methodCount = element.Methods.Count;
        return methodCount > 5 ? this.layout.interfaceWidth + 40 : this.layout.interfaceWidth;
    } else {
        // Classes width depends on attributes and methods
        var attrCount = element.Attributes.Count;
        var methodCount = element.Methods.Count;
        var extraWidth = 0;
        
        // Find longest attribute name for width estimation
        for (var i = 0; i < attrCount; i++) {
            var attr = element.Attributes.GetAt(i);
            var nameLength = attr.Name.length + (attr.Type ? attr.Type.length : 0);
            extraWidth = Math.max(extraWidth, nameLength * 2);
        }
        
        return Math.min(Math.max(this.layout.classWidth, extraWidth), this.layout.classWidth + 100);
    }
};

/**
 * Calculate element height based on content
 */
PlantUMLParser.prototype.calculateElementHeight = function(element) {
    var attrCount = element.Attributes.Count;
    var methodCount = element.Methods.Count;
    var baseHeight = element.Type == "Interface" ? this.layout.interfaceHeight : this.layout.classHeight;
    
    // Add height for attributes and methods
    var contentHeight = (attrCount * 15) + (methodCount * 15);
    return Math.min(Math.max(baseHeight, contentHeight + 40), 400);
};

/**
 * Adjust layout based on relationships (hierarchical positioning)
 */
PlantUMLParser.prototype.adjustLayoutForRelationships = function() {
    // Build relationship graph
    var childToParent = {};
    var parentToChildren = {};
    
    for (var i = 0; i < this.relationships.length; i++) {
        var rel = this.relationships[i];
        
        // For inheritance and realization, position child below parent
        if (rel.type == "Generalization" || rel.type == "Realization") {
            childToParent[rel.source] = rel.target;
            
            if (!parentToChildren[rel.target]) {
                parentToChildren[rel.target] = [];
            }
            parentToChildren[rel.target].push(rel.source);
        }
    }
    
    // Adjust Y positions to create hierarchy
    for (var parent in parentToChildren) {
        if (this.elementPositions[parent]) {
            var parentPos = this.elementPositions[parent];
            var children = parentToChildren[parent];
            var childY = parentPos.y + parentPos.height + this.layout.classSpacingY;
            
            // Position children horizontally around parent
            var totalWidth = 0;
            for (var i = 0; i < children.length; i++) {
                var childName = children[i];
                if (this.elementPositions[childName]) {
                    totalWidth += this.elementPositions[childName].width + this.layout.margin;
                }
            }
            
            var startX = parentPos.x - (totalWidth / 2) + (parentPos.width / 2);
            var currentX = startX;
            
            for (var i = 0; i < children.length; i++) {
                var childName = children[i];
                if (this.elementPositions[childName]) {
                    this.elementPositions[childName].x = currentX;
                    this.elementPositions[childName].y = childY;
                    currentX += this.elementPositions[childName].width + this.layout.margin;
                }
            }
        }
    }
};

/**
 * Apply calculated positions to diagram objects
 * First add components, then add classes inside them
 */
PlantUMLParser.prototype.applyLayoutToElements = function() {
    // First, add all component elements to the diagram
    for (var pkgName in this.componentPositions) {
        var component = this.packageComponents[pkgName];
        if (component) {
            var pos = this.componentPositions[pkgName];
            Session.Output("Positioning component: " + pkgName);
            this.addComponentToDiagram(component, pos);
        }
    }
    
    // Then, add all class/interface elements inside their components
    for (var name in this.elements) {
        var element = this.elements[name];
        var pos = this.elementPositions[name];
        
        if (pos) {
            this.addElementToDiagramWithPosition(element, pos);
        } else {
            // Fallback position if not calculated
            this.addElementToDiagramWithPosition(element, {
                x: this.layout.startX,
                y: this.layout.startY,
                width: this.layout.classWidth,
                height: this.layout.classHeight
            });
        }
    }
};

/**
 * Add component to diagram
 */
PlantUMLParser.prototype.addComponentToDiagram = function(component, pos) {
    var left = Math.round(pos.x);
    var top = Math.round(pos.y);
    var right = Math.round(pos.x + pos.width);
    var bottom = Math.round(pos.y + pos.height);
    
    var diagramObject = this.diagram.DiagramObjects.AddNew(
        "l=" + left + ";t=" + top + ";r=" + right + ";b=" + bottom + ";", 
        ""
    );
    diagramObject.ElementID = component.ElementID;
    diagramObject.Update();
    
    // Store for potential later adjustment
    this.diagramObjects[component.Name] = diagramObject;
};

/**
 * Add element to diagram with specific position
 */
PlantUMLParser.prototype.addElementToDiagramWithPosition = function(element, pos) {
    var left = Math.round(pos.x);
    var top = Math.round(pos.y);
    var right = Math.round(pos.x + pos.width);
    var bottom = Math.round(pos.y + pos.height);
    
    var diagramObject = this.diagram.DiagramObjects.AddNew(
        "l=" + left + ";t=" + top + ";r=" + right + ";b=" + bottom + ";", 
        ""
    );
    diagramObject.ElementID = element.ElementID;
    diagramObject.Update();
    
    // Store for potential later adjustment
    this.diagramObjects[element.Name] = diagramObject;
};

PlantUMLParser.prototype.printSummary = function() {
    Session.Output("");
    Session.Output("========================================");
    Session.Output("Conversion Summary:");
    Session.Output("========================================");
    Session.Output("Packages created:      " + this.stats.packages);
    Session.Output("Components created:    " + this.stats.components);
    Session.Output("Classes created:       " + this.stats.classes);
    Session.Output("Interfaces created:    " + this.stats.interfaces);
    Session.Output("Attributes created:    " + this.stats.attributes);
    Session.Output("Methods created:       " + this.stats.methods);
    Session.Output("Relationships created: " + this.stats.relationships);
};

// Run the main function
main();

