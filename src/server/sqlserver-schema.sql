-- ============================================================================
-- SGN - Sistema para Gestión de Negocios
-- Esquema Relacional para Microsoft SQL Server (T-SQL)
-- Integración mediante mssql / Tedious
-- Moneda: Lempiras de Honduras (HNL) | Impuesto: ISV 15% | RTN
-- ============================================================================

CREATE TABLE DatosNegocio (
    Id INT PRIMARY KEY CHECK (Id = 1),
    NombreComercial NVARCHAR(150) NOT NULL,
    RazonSocial NVARCHAR(180) NULL,
    RTN NVARCHAR(30) NULL,
    Telefono NVARCHAR(30) NULL,
    Correo NVARCHAR(150) NULL,
    Direccion NVARCHAR(250) NULL,
    CAI NVARCHAR(80) NULL,
    PieFactura NVARCHAR(300) NULL,
    FechaActualizacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE Usuarios (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    NombreCompleto NVARCHAR(120) NOT NULL,
    NombreUsuario NVARCHAR(60) NOT NULL UNIQUE,
    Correo NVARCHAR(150) NOT NULL UNIQUE,
    PasswordHash NVARCHAR(255) NOT NULL,
    Rol NVARCHAR(20) NOT NULL CHECK (Rol IN ('Administrador', 'Cajero')),
    Activo BIT NOT NULL DEFAULT 1,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UltimoAcceso DATETIME2 NULL
);

CREATE TABLE Categorias (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Nombre NVARCHAR(80) NOT NULL UNIQUE,
    Descripcion NVARCHAR(250) NULL
);

CREATE TABLE Productos (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    SKU NVARCHAR(40) NOT NULL UNIQUE,
    Nombre NVARCHAR(150) NOT NULL,
    Descripcion NVARCHAR(400) NULL,
    CategoriaId INT NOT NULL,
    PrecioVenta DECIMAL(12,2) NOT NULL CHECK (PrecioVenta >= 0),
    CostoCompra DECIMAL(12,2) NOT NULL CHECK (CostoCompra >= 0),
    Existencia INT NOT NULL DEFAULT 0 CHECK (Existencia >= 0),
    StockMinimo INT NOT NULL DEFAULT 5 CHECK (StockMinimo >= 0),
    Activo BIT NOT NULL DEFAULT 1,
    FechaActualizacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Productos_Categorias FOREIGN KEY (CategoriaId) REFERENCES Categorias(Id)
);

CREATE TABLE Clientes (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Nombre NVARCHAR(150) NOT NULL,
    RTN NVARCHAR(30) NULL,
    Telefono NVARCHAR(30) NOT NULL,
    Correo NVARCHAR(150) NULL,
    Direccion NVARCHAR(250) NULL,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE Proveedores (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    RazonSocial NVARCHAR(150) NOT NULL,
    ContactoPrincipal NVARCHAR(120) NOT NULL,
    RTN NVARCHAR(30) NULL,
    Telefono NVARCHAR(30) NOT NULL,
    Correo NVARCHAR(150) NULL,
    Direccion NVARCHAR(250) NULL,
    FechaCreacion DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE Ventas (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Folio NVARCHAR(30) NOT NULL UNIQUE,
    NumeroFactura NVARCHAR(30) NOT NULL UNIQUE,
    ClienteId INT NOT NULL,
    ClienteNombre NVARCHAR(150) NOT NULL,
    ClienteRTN NVARCHAR(30) NULL,
    ClienteTelefono NVARCHAR(30) NULL,
    ClienteDireccion NVARCHAR(250) NULL,
    UsuarioId INT NOT NULL,
    UsuarioNombre NVARCHAR(120) NOT NULL,
    MetodoPago NVARCHAR(20) NOT NULL CHECK (MetodoPago IN ('Efectivo', 'Tarjeta', 'Transferencia')),
    IncluyeISV BIT NOT NULL DEFAULT 1,
    Subtotal DECIMAL(12,2) NOT NULL,
    ISV DECIMAL(12,2) NOT NULL,
    Total DECIMAL(12,2) NOT NULL,
    Notas NVARCHAR(300) NULL,
    DatosNegocioSnapshot NVARCHAR(MAX) NULL,
    FechaVenta DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Ventas_Clientes FOREIGN KEY (ClienteId) REFERENCES Clientes(Id),
    CONSTRAINT FK_Ventas_Usuarios FOREIGN KEY (UsuarioId) REFERENCES Usuarios(Id)
);

CREATE TABLE DetalleVentas (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    VentaId INT NOT NULL,
    ProductoId INT NOT NULL,
    ProductoSKU NVARCHAR(40) NOT NULL,
    ProductoNombre NVARCHAR(150) NOT NULL,
    Cantidad INT NOT NULL CHECK (Cantidad > 0),
    PrecioUnitario DECIMAL(12,2) NOT NULL,
    ImporteLinea DECIMAL(12,2) NOT NULL,
    CONSTRAINT FK_DetalleVentas_Ventas FOREIGN KEY (VentaId) REFERENCES Ventas(Id) ON DELETE CASCADE,
    CONSTRAINT FK_DetalleVentas_Productos FOREIGN KEY (ProductoId) REFERENCES Productos(Id)
);

CREATE TABLE Compras (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Folio NVARCHAR(30) NOT NULL UNIQUE,
    ProveedorId INT NOT NULL,
    UsuarioId INT NOT NULL,
    Estado NVARCHAR(20) NOT NULL CHECK (Estado IN ('Pendiente', 'Confirmada')),
    IncluyeISV BIT NOT NULL DEFAULT 1,
    Subtotal DECIMAL(12,2) NOT NULL,
    ISV DECIMAL(12,2) NOT NULL,
    Total DECIMAL(12,2) NOT NULL,
    Notas NVARCHAR(300) NULL,
    FechaCompra DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    FechaConfirmacion DATETIME2 NULL,
    CONSTRAINT FK_Compras_Proveedores FOREIGN KEY (ProveedorId) REFERENCES Proveedores(Id),
    CONSTRAINT FK_Compras_Usuarios FOREIGN KEY (UsuarioId) REFERENCES Usuarios(Id)
);

CREATE TABLE DetalleCompras (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    CompraId INT NOT NULL,
    ProductoId INT NOT NULL,
    ProductoSKU NVARCHAR(40) NOT NULL,
    ProductoNombre NVARCHAR(150) NOT NULL,
    Cantidad INT NOT NULL CHECK (Cantidad > 0),
    CostoUnitario DECIMAL(12,2) NOT NULL,
    ImporteLinea DECIMAL(12,2) NOT NULL,
    CONSTRAINT FK_DetalleCompras_Compras FOREIGN KEY (CompraId) REFERENCES Compras(Id) ON DELETE CASCADE,
    CONSTRAINT FK_DetalleCompras_Productos FOREIGN KEY (ProductoId) REFERENCES Productos(Id)
);

CREATE INDEX IX_Productos_Categoria ON Productos(CategoriaId);
CREATE INDEX IX_Ventas_Fecha ON Ventas(FechaVenta DESC);
CREATE INDEX IX_Compras_Estado ON Compras(Estado);
